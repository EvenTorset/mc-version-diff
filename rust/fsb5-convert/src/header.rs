use crate::codec::Codec;
use crate::error::Fsb5Error;

const MAGIC: &[u8; 4] = b"FSB5";
const BASE_HEADER_SIZE: usize = 4 + 4 * 6 + 8 + 16 + 8; // id + 6 u32s + zero + hash + dummy

const STANDARD_FREQUENCIES: [u32; 10] = [0, 8000, 11000, 11025, 16000, 22050, 24000, 32000, 44100, 48000];

#[derive(Debug, Clone)]
pub struct SampleInfo<'a> {
  pub name: String,
  pub frequency: u32,
  pub channels: u8,
  pub sample_count: u32,
  pub(crate) data: &'a [u8],
}

#[derive(Debug, Clone)]
pub struct Fsb5<'a> {
  pub version: u32,
  pub codec: Codec,
  pub samples: Vec<SampleInfo<'a>>,
}

struct Cursor<'a> {
  data: &'a [u8],
  pos: usize,
}

impl<'a> Cursor<'a> {
  fn new(data: &'a [u8]) -> Self {
    Cursor { data, pos: 0 }
  }

  fn take(&mut self, len: usize, context: &'static str) -> Result<&'a [u8], Fsb5Error> {
    let end = self.pos.checked_add(len).ok_or(Fsb5Error::UnexpectedEof(context))?;
    let slice = self.data.get(self.pos..end).ok_or(Fsb5Error::UnexpectedEof(context))?;
    self.pos = end;
    Ok(slice)
  }

  fn u32(&mut self, context: &'static str) -> Result<u32, Fsb5Error> {
    let b = self.take(4, context)?;
    Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
  }

  fn u64(&mut self, context: &'static str) -> Result<u64, Fsb5Error> {
    let b = self.take(8, context)?;
    Ok(u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
  }
}

fn bits64(value: u64, start: u32, len: u32) -> u64 {
  let mask = if len >= 64 { u64::MAX } else { (1u64 << len) - 1 };
  (value >> start) & mask
}

fn bits32(value: u32, start: u32, len: u32) -> u32 {
  let mask = if len >= 32 { u32::MAX } else { (1u32 << len) - 1 };
  (value >> start) & mask
}

mod chunk_type {
  pub const CHANNELS: u32 = 1;
  pub const FREQUENCY: u32 = 2;
}

pub fn parse(data: &[u8]) -> Result<Fsb5<'_>, Fsb5Error> {
  if data.len() < 4 || &data[0..4] != MAGIC {
    return Err(Fsb5Error::NotFsb5);
  }

  let mut cursor = Cursor::new(data);
  cursor.take(4, "magic")?; // "FSB5"
  let version = cursor.u32("version")?;
  let num_samples = cursor.u32("numSamples")?;
  let sample_headers_size = cursor.u32("sampleHeadersSize")? as usize;
  let name_table_size = cursor.u32("nameTableSize")? as usize;
  let data_size = cursor.u32("dataSize")? as usize;
  let mode = cursor.u32("mode")?;
  cursor.take(8, "zero")?;
  cursor.take(16, "hash")?;
  cursor.take(8, "dummy")?;
  if version == 0 {
    // Older banks have one extra (unused) field here
    cursor.u32("version0 padding")?;
  } else if version != 1 {
    return Err(Fsb5Error::UnsupportedVersion(version));
  }

  let header_size = cursor.pos;
  debug_assert!(header_size == BASE_HEADER_SIZE || header_size == BASE_HEADER_SIZE + 4);

  struct RawSample {
    frequency: u32,
    channels: u8,
    data_offset: usize,
    sample_count: u32,
  }

  let mut raw_samples = Vec::with_capacity(num_samples as usize);
  for _ in 0..num_samples {
    let packed = cursor.u64("sample header")?;
    let mut next_chunk = bits64(packed, 0, 1) != 0;
    let frequency_index = bits64(packed, 1, 4) as usize;
    let channels = bits64(packed, 5, 1) as u8 + 1;
    let data_offset = (bits64(packed, 6, 28) * 16) as usize;
    let sample_count = bits64(packed, 34, 30) as u32;

    let mut frequency = *STANDARD_FREQUENCIES.get(frequency_index).unwrap_or(&0);
    let mut channels = channels;

    while next_chunk {
      let chunk_header = cursor.u32("sample chunk header")?;
      next_chunk = bits32(chunk_header, 0, 1) != 0;
      let chunk_size = bits32(chunk_header, 1, 24) as usize;
      let chunk_type = bits32(chunk_header, 25, 7);
      let chunk_data = cursor.take(chunk_size, "sample chunk data")?;

      match chunk_type {
        chunk_type::FREQUENCY if chunk_size >= 4 => {
          frequency = u32::from_le_bytes([chunk_data[0], chunk_data[1], chunk_data[2], chunk_data[3]]);
        }
        chunk_type::CHANNELS if chunk_size >= 1 => {
          channels = chunk_data[0];
        }
        _ => {}
      }
    }

    raw_samples.push(RawSample { frequency, channels, data_offset, sample_count });
  }

  let name_table_start = header_size + sample_headers_size;
  let name_table = data
    .get(name_table_start..name_table_start + name_table_size)
    .ok_or(Fsb5Error::UnexpectedEof("name table"))?;

  let names: Vec<String> = if name_table_size == 0 || num_samples == 0 {
    Vec::new()
  } else {
    let mut names = Vec::with_capacity(num_samples as usize);
    let mut offsets_cursor = Cursor::new(name_table);
    for _ in 0..num_samples {
      let offset = offsets_cursor.u32("name offset")? as usize;
      let name_bytes = name_table.get(offset..).ok_or(Fsb5Error::UnexpectedEof("sample name"))?;
      let end = name_bytes.iter().position(|&b| b == 0).unwrap_or(name_bytes.len());
      names.push(String::from_utf8_lossy(&name_bytes[..end]).into_owned());
    }
    names
  };

  let data_section_start = name_table_start + name_table_size;
  let data_section = data
    .get(data_section_start..data_section_start + data_size)
    .ok_or(Fsb5Error::UnexpectedEof("sample data section"))?;

  let mut samples = Vec::with_capacity(raw_samples.len());
  for (i, raw) in raw_samples.iter().enumerate() {
    let start = raw.data_offset;
    let end = raw_samples.get(i + 1).map(|next| next.data_offset).unwrap_or(data_size);
    let slice = data_section
      .get(start..end.max(start))
      .ok_or(Fsb5Error::UnexpectedEof("sample data"))?;

    let name = names.get(i).cloned().unwrap_or_else(|| format!("sample_{i}"));

    samples.push(SampleInfo {
      name,
      frequency: raw.frequency,
      channels: raw.channels,
      sample_count: raw.sample_count,
      data: slice,
    });
  }

  Ok(Fsb5 { version, codec: Codec::from_u32(mode), samples })
}
