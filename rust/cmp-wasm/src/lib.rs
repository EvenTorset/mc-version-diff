//! One wasm call compares a whole batch: zip entry inflation, PNG pixel
//! comparison, NBT comparison with the DataVersion masked, structures compared
//! by the blocks they hold, and JSON compared by its values. Anything malformed
//! compares as false, matching how the worker treated a throw.

use minecraft_block_reader::{read_any, Compound, State, Structure, Value};
use std::collections::BTreeMap;
use png_pixel_cmp::compare_png_pixels;
use serde_json::{Number as JsonNumber, Value as JsonValue};
use wasm_bindgen::prelude::*;
use zune_inflate::{DeflateDecoder, DeflateOptions};

/// Fields per task in the `tasks` array.
const STRIDE: usize = 8;

const ENTRY_LIMIT: usize = 1 << 30;

/// `tasks` is a flat array with a stride of [`STRIDE`]:
/// kind (0 png, 1 nbt, 2 structure, 3 json), aOffset, aLength, aMethod,
/// bOffset, bLength, bMethod, littleEndian.
#[wasm_bindgen]
pub fn compare_batch(buffer: &[u8], tasks: &[u32]) -> Vec<u8> {
    let count = tasks.len() / STRIDE;
    let mut results = vec![0u8; count];

    for i in 0..count {
        let t = &tasks[i * STRIDE..i * STRIDE + STRIDE];
        let same = run_task(
            buffer,
            t[0],
            (t[1] as usize, t[2] as usize, t[3]),
            (t[4] as usize, t[5] as usize, t[6]),
            t[7] != 0,
        );
        results[i] = same.unwrap_or(false) as u8;
    }

    results
}

fn run_task(
    buffer: &[u8],
    kind: u32,
    a: (usize, usize, u32),
    b: (usize, usize, u32),
    little_endian: bool,
) -> Option<bool> {
    let raw_a = decompress_entry(buffer.get(a.0..a.0 + a.1)?, a.2)?;
    let raw_b = decompress_entry(buffer.get(b.0..b.0 + b.1)?, b.2)?;

    match kind {
        0 => compare_png_pixels(&raw_a, &raw_b).ok(),
        2 => compare_structure(&raw_a, &raw_b, little_endian),
        3 => compare_json(&raw_a, &raw_b),
        _ => compare_nbt(&raw_a, &raw_b, little_endian),
    }
}

/// `3` and `3.0` are the same number, so a file rewritten with the other
/// spelling is not a change.
fn compare_json(a: &[u8], b: &[u8]) -> Option<bool> {
    let a: JsonValue = serde_json::from_slice(a).ok()?;
    let b: JsonValue = serde_json::from_slice(b).ok()?;
    Some(same_json(&a, &b))
}

fn same_json(a: &JsonValue, b: &JsonValue) -> bool {
    match (a, b) {
        (JsonValue::Number(x), JsonValue::Number(y)) => same_json_number(x, y),
        (JsonValue::Array(x), JsonValue::Array(y)) => {
            x.len() == y.len() && x.iter().zip(y).all(|(i, j)| same_json(i, j))
        }
        (JsonValue::Object(x), JsonValue::Object(y)) => {
            x.len() == y.len()
                && x.iter()
                    .all(|(k, v)| y.get(k).is_some_and(|other| same_json(v, other)))
        }
        _ => a == b,
    }
}

fn same_json_number(x: &JsonNumber, y: &JsonNumber) -> bool {
    // whole numbers first, so the ones f64 cannot hold still compare exactly
    if let (Some(x), Some(y)) = (x.as_i64(), y.as_i64()) {
        return x == y;
    }
    if let (Some(x), Some(y)) = (x.as_u64(), y.as_u64()) {
        return x == y;
    }
    match (x.as_f64(), y.as_f64()) {
        (Some(x), Some(y)) => x == y,
        _ => false,
    }
}

fn inflate_options(limit: usize) -> DeflateOptions {
    DeflateOptions::default()
        .set_confirm_checksum(false)
        .set_limit(limit)
}

fn decompress_entry(data: &[u8], method: u32) -> Option<Vec<u8>> {
    if method == 0 {
        return Some(data.to_vec());
    }
    DeflateDecoder::new_with_options(data, inflate_options(ENTRY_LIMIT))
        .decode_deflate()
        .ok()
}

fn compare_nbt(a: &[u8], b: &[u8], little_endian: bool) -> Option<bool> {
    let mut a = decompress_nbt(a.to_vec())?;
    let mut b = decompress_nbt(b.to_vec())?;
    if a.len() != b.len() {
        return Some(false);
    }

    if let Some(offset) = find_data_version_offset(&a, little_endian) {
        a[offset..offset + 4].fill(0);
    }
    if let Some(offset) = find_data_version_offset(&b, little_endian) {
        b[offset..offset + 4].fill(0);
    }

    Some(a == b)
}

fn compare_structure(a: &[u8], b: &[u8], little_endian: bool) -> Option<bool> {
    if compare_nbt(a, b, little_endian) == Some(true) {
        return Some(true);
    }
    Some(same_structure(&read_any(a)?, &read_any(b)?))
}

fn same_structure(a: &Structure, b: &Structure) -> bool {
    a.size == b.size
        && a.palette.len() == b.palette.len()
        && a.blocks.len() == b.blocks.len()
        && a.entities.len() == b.entities.len()
        && a.palette.iter().zip(&b.palette).all(same_state)
        && a.blocks.iter().zip(&b.blocks).all(|(x, y)| {
            x.state == y.state && x.pos == y.pos && same_opt(x.nbt.as_ref(), y.nbt.as_ref())
        })
        && a.entities
            .iter()
            .zip(&b.entities)
            .all(|(x, y)| x.pos == y.pos && same_compound(&x.nbt, &y.nbt))
}

fn same_state((a, b): (&State, &State)) -> bool {
    if a.id != b.id {
        return false;
    }
    match (&a.properties, &b.properties) {
        (None, None) => true,
        (Some(x), Some(y)) if x.len() == y.len() => {
            let mut x: Vec<_> = x.iter().collect();
            let mut y: Vec<_> = y.iter().collect();
            x.sort();
            y.sort();
            x == y
        }
        _ => false,
    }
}

fn same_opt(a: Option<&Compound>, b: Option<&Compound>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(x), Some(y)) => same_compound(x, y),
        _ => false,
    }
}

fn same_compound(a: &Compound, b: &Compound) -> bool {
    let (a, b) = (fields(a), fields(b));
    a.len() == b.len()
        && a.iter()
            .zip(b.iter())
            .all(|((ka, va), (kb, vb))| ka == kb && same_value(va, vb))
}

fn fields(c: &Compound) -> BTreeMap<&str, &Value> {
    let loot = c.entries.iter().any(|(k, _)| k == "LootTable");
    c.entries
        .iter()
        .filter(|(k, v)| !is_identity(k) && !(loot && is_empty_contents(k, v)))
        .map(|(k, v)| (k.as_str(), v))
        .collect()
}

fn is_identity(k: &str) -> bool {
    matches!(k, "UUID" | "UUIDMost" | "UUIDLeast")
}

fn is_empty_contents(k: &str, v: &Value) -> bool {
    match v {
        Value::List(_, items) => k == "Items" && items.is_empty(),
        Value::Compound(c) => k == "components" && c.entries.is_empty(),
        _ => false,
    }
}

fn same_value(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Compound(x), Value::Compound(y)) => same_compound(x, y),
        (Value::List(_, xs), Value::List(_, ys)) => {
            xs.len() == ys.len() && xs.iter().zip(ys).all(|(x, y)| same_value(x, y))
        }
        _ => {
            if let (Some(x), Some(y)) = (as_int(a), as_int(b)) {
                return x == y;
            }
            if let (Some(x), Some(y)) = (as_float(a), as_float(b)) {
                return x == y;
            }
            a == b
        }
    }
}

/// A tag's numeric type is not the value, so `3f` and `3` match. Whole numbers
/// are matched as integers to keep the ones f64 cannot hold exact.
fn as_int(v: &Value) -> Option<i64> {
    match v {
        Value::Byte(x) => Some(*x as i64),
        Value::Short(x) => Some(*x as i64),
        Value::Int(x) => Some(*x as i64),
        Value::Long(x) => Some(*x),
        _ => None,
    }
}

fn as_float(v: &Value) -> Option<f64> {
    match v {
        Value::Float(x) => Some(*x as f64),
        Value::Double(x) => Some(*x),
        _ => as_int(v).map(|x| x as f64),
    }
}

fn decompress_nbt(bytes: Vec<u8>) -> Option<Vec<u8>> {
    if bytes.len() < 2 {
        return Some(bytes);
    }
    if bytes[0] == 0x1f && bytes[1] == 0x8b {
        return DeflateDecoder::new_with_options(&bytes, inflate_options(ENTRY_LIMIT))
            .decode_gzip()
            .ok();
    }
    if bytes[0] == 0x78 && ((bytes[0] as u32) << 8 | bytes[1] as u32) % 31 == 0 {
        return DeflateDecoder::new_with_options(&bytes, inflate_options(ENTRY_LIMIT))
            .decode_zlib()
            .ok();
    }
    Some(bytes)
}

struct NbtWalker<'a> {
    bytes: &'a [u8],
    offset: usize,
    le: bool,
}

impl<'a> NbtWalker<'a> {
    fn u8(&mut self) -> Option<u8> {
        let v = *self.bytes.get(self.offset)?;
        self.offset += 1;
        Some(v)
    }

    fn u16(&mut self) -> Option<u16> {
        let s = self.bytes.get(self.offset..self.offset + 2)?;
        self.offset += 2;
        Some(if self.le {
            u16::from_le_bytes([s[0], s[1]])
        } else {
            u16::from_be_bytes([s[0], s[1]])
        })
    }

    fn i32(&mut self) -> Option<i32> {
        let s = self.bytes.get(self.offset..self.offset + 4)?;
        self.offset += 4;
        Some(if self.le {
            i32::from_le_bytes([s[0], s[1], s[2], s[3]])
        } else {
            i32::from_be_bytes([s[0], s[1], s[2], s[3]])
        })
    }

    fn skip(&mut self, n: usize) -> Option<()> {
        if self.offset + n > self.bytes.len() {
            return None;
        }
        self.offset += n;
        Some(())
    }

    fn skip_payload(&mut self, tag: u8, depth: u32) -> Option<()> {
        if depth > 512 {
            return None;
        }
        match tag {
            1 => self.skip(1),
            2 => self.skip(2),
            3 | 5 => self.skip(4),
            4 | 6 => self.skip(8),
            7 => {
                let n = self.i32()?;
                self.skip(usize::try_from(n).ok()?)
            }
            8 => {
                let n = self.u16()?;
                self.skip(n as usize)
            }
            11 => {
                let n = self.i32()?;
                self.skip(usize::try_from(n).ok()?.checked_mul(4)?)
            }
            12 => {
                let n = self.i32()?;
                self.skip(usize::try_from(n).ok()?.checked_mul(8)?)
            }
            9 => {
                let element = self.u8()?;
                let n = self.i32()?;
                for _ in 0..usize::try_from(n).unwrap_or(0) {
                    self.skip_payload(element, depth + 1)?;
                }
                Some(())
            }
            10 => loop {
                let entry = self.u8()?;
                if entry == 0 {
                    return Some(());
                }
                let n = self.u16()?;
                self.skip(n as usize)?;
                self.skip_payload(entry, depth + 1)?;
            },
            _ => None,
        }
    }
}

/// Byte offset of the 4-byte DataVersion int payload in the top-level
/// compound, if there is one.
fn find_data_version_offset(bytes: &[u8], le: bool) -> Option<usize> {
    let mut w = NbtWalker { bytes, offset: 0, le };

    if w.u8()? != 10 {
        return None;
    }
    let root_name = w.u16()?;
    w.skip(root_name as usize)?;

    loop {
        let tag = w.u8()?;
        if tag == 0 {
            return None;
        }
        let name_len = w.u16()? as usize;
        let name = w.bytes.get(w.offset..w.offset + name_len)?;
        let is_data_version = name == b"DataVersion";
        w.skip(name_len)?;

        if is_data_version {
            if tag != 3 {
                return None;
            }
            return Some(w.offset);
        }

        w.skip_payload(tag, 0)?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use minecraft_block_reader::nbt::Writer;

    fn c(entries: &[(&str, Value)]) -> Compound {
        Compound {
            entries: entries.iter().map(|(k, v)| (k.to_string(), v.clone())).collect(),
        }
    }

    /// props are written in the order given, so a caller can swap them
    fn structure(props: &[(&str, &str)], block_pos: [i32; 3]) -> Vec<u8> {
        let state = c(&[
            ("Name", Value::Str("minecraft:oak_stairs".into())),
            (
                "Properties",
                Value::Compound(c(&props
                    .iter()
                    .map(|(k, v)| (*k, Value::Str((*v).into())))
                    .collect::<Vec<_>>())),
            ),
        ]);
        let block = c(&[
            ("state", Value::Int(0)),
            (
                "pos",
                Value::List(3, block_pos.iter().map(|x| Value::Int(*x)).collect()),
            ),
        ]);
        let root = c(&[
            ("size", Value::List(3, vec![Value::Int(1), Value::Int(1), Value::Int(1)])),
            ("palette", Value::List(10, vec![Value::Compound(state)])),
            ("blocks", Value::List(10, vec![Value::Compound(block)])),
            ("entities", Value::List(10, vec![])),
        ]);
        Writer::new().root(&root)
    }

    #[test]
    fn identical_bytes_match() {
        let a = structure(&[("facing", "north"), ("half", "top")], [0, 0, 0]);
        assert_eq!(compare_structure(&a, &a, false), Some(true));
    }

    #[test]
    fn property_order_does_not_count_as_a_change() {
        let a = structure(&[("facing", "north"), ("half", "top")], [0, 0, 0]);
        let b = structure(&[("half", "top"), ("facing", "north")], [0, 0, 0]);
        assert_ne!(a, b, "the fixtures must differ as bytes");
        assert_eq!(compare_structure(&a, &b, false), Some(true));
    }

    #[test]
    fn a_moved_block_is_a_change() {
        let a = structure(&[("facing", "north")], [0, 0, 0]);
        let b = structure(&[("facing", "north")], [0, 1, 0]);
        assert_eq!(compare_structure(&a, &b, false), Some(false));
    }

    #[test]
    fn a_different_property_value_is_a_change() {
        let a = structure(&[("facing", "north")], [0, 0, 0]);
        let b = structure(&[("facing", "south")], [0, 0, 0]);
        assert_eq!(compare_structure(&a, &b, false), Some(false));
    }

    #[test]
    fn garbage_does_not_match() {
        assert_eq!(compare_structure(b"not nbt", b"also not nbt", false), None);
    }

    #[test]
    fn json_float_and_int_spellings_match() {
        let a = br#"{"type":"minecraft:uniform","max":3.0,"min":1.0}"#;
        let b = br#"{"type":"minecraft:uniform","max":3,"min":1}"#;
        assert_eq!(compare_json(a, b), Some(true));
    }

    #[test]
    fn json_value_changes_are_still_changes() {
        let a = br#"{"max":3.0}"#;
        let b = br#"{"max":4}"#;
        assert_eq!(compare_json(a, b), Some(false));
    }

    #[test]
    fn json_keeps_big_integers_exact() {
        // both sit past what f64 can tell apart
        let a = br#"{"seed":9007199254740993}"#;
        let b = br#"{"seed":9007199254740992}"#;
        assert_eq!(compare_json(a, b), Some(false));
    }

    #[test]
    fn json_missing_key_is_a_change() {
        let a = br#"{"a":1,"b":2}"#;
        let b = br#"{"a":1}"#;
        assert_eq!(compare_json(a, b), Some(false));
    }

    #[test]
    fn json_true_is_not_one() {
        assert_eq!(compare_json(br#"{"a":true}"#, br#"{"a":1}"#), Some(false));
    }

    #[test]
    fn broken_json_does_not_match() {
        assert_eq!(compare_json(b"{", b"{"), None);
    }

    #[test]
    fn nbt_numeric_tags_match_on_value() {
        assert!(same_value(&Value::Float(3.0), &Value::Int(3)));
        assert!(same_value(&Value::Byte(1), &Value::Long(1)));
        assert!(!same_value(&Value::Float(3.5), &Value::Int(3)));
        assert!(!same_value(&Value::Int(3), &Value::Str("3".into())));
    }

    #[test]
    fn nbt_keeps_big_longs_exact() {
        let a = Value::Long(9007199254740993);
        let b = Value::Long(9007199254740992);
        assert!(!same_value(&a, &b));
    }

    #[test]
    fn a_uuid_is_not_content() {
        let with = c(&[("id", Value::Str("minecraft:cushion".into())), ("UUID", Value::IntArray(vec![1, 2, 3, 4]))]);
        let other = c(&[("id", Value::Str("minecraft:cushion".into())), ("UUID", Value::IntArray(vec![9, 9, 9, 9]))]);
        let without = c(&[("id", Value::Str("minecraft:cushion".into()))]);
        assert!(same_compound(&with, &other), "a rewritten uuid is not a change");
        assert!(same_compound(&with, &without), "having one and not the other is not a change");
    }

    #[test]
    fn an_unfilled_loot_container_matches_one_without_the_fields() {
        let full = c(&[
            ("LootTable", Value::Str("minecraft:chests/x".into())),
            ("components", Value::Compound(Compound::default())),
            ("Items", Value::List(10, vec![])),
        ]);
        let bare = c(&[("LootTable", Value::Str("minecraft:chests/x".into()))]);
        assert!(same_compound(&full, &bare));
    }

    #[test]
    fn an_empty_field_counts_everywhere_else() {
        let full = c(&[("id", Value::Str("minecraft:chest".into())), ("Items", Value::List(10, vec![]))]);
        let bare = c(&[("id", Value::Str("minecraft:chest".into()))]);
        assert!(!same_compound(&full, &bare), "no loot table, so an empty list is not nothing");
    }

    #[test]
    fn a_filled_loot_container_still_differs() {
        let full = c(&[
            ("LootTable", Value::Str("minecraft:chests/x".into())),
            ("Items", Value::List(10, vec![Value::Compound(c(&[("id", Value::Str("stone".into()))]))])),
        ]);
        let bare = c(&[("LootTable", Value::Str("minecraft:chests/x".into()))]);
        assert!(!same_compound(&full, &bare));
    }
}
