//! One wasm call compares a whole batch: zip entry inflation, PNG pixel
//! comparison and NBT comparison with the DataVersion masked. Anything
//! malformed compares as false, matching how the worker treated a throw.

use png_pixel_cmp::compare_png_pixels;
use wasm_bindgen::prelude::*;
use zune_inflate::{DeflateDecoder, DeflateOptions};

/// Fields per task in the `tasks` array.
const STRIDE: usize = 8;

const ENTRY_LIMIT: usize = 1 << 30;

/// `tasks` is a flat array with a stride of [`STRIDE`]:
/// kind (0 png, 1 nbt), aOffset, aLength, aMethod, bOffset, bLength, bMethod,
/// littleEndian.
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

    if kind == 0 {
        compare_png_pixels(&raw_a, &raw_b).ok()
    } else {
        compare_nbt(raw_a, raw_b, little_endian)
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

fn compare_nbt(a: Vec<u8>, b: Vec<u8>, little_endian: bool) -> Option<bool> {
    let mut a = decompress_nbt(a)?;
    let mut b = decompress_nbt(b)?;
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
