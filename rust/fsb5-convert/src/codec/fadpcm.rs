const BLOCK_SIZE: usize = 0x8c;
const BLOCK_HEADER_SIZE: usize = 0x0c;
const BLOCK_SAMPLES: usize = (BLOCK_SIZE - BLOCK_HEADER_SIZE) * 2; // 256

const COEFS: [(i32, i32); 8] = [
  (0, 0),
  (60, 0),
  (122, 60),
  (115, 52),
  (98, 55),
  (0, 0),
  (0, 0),
  (0, 0),
];

fn clamp16(v: i32) -> i16 {
  v.clamp(i16::MIN as i32, i16::MAX as i32) as i16
}

fn decode_block(block: &[u8], max_samples: usize, out: &mut Vec<i16>) {
  let coefs_word = u32::from_le_bytes([block[0], block[1], block[2], block[3]]);
  let shifts_word = u32::from_le_bytes([block[4], block[5], block[6], block[7]]);
  let mut hist1 = i16::from_le_bytes([block[8], block[9]]) as i32;
  let mut hist2 = i16::from_le_bytes([block[10], block[11]]) as i32;

  let mut coef_index = [0u32; 8];
  let mut shift_factor = [0u32; 8];
  for i in 0..8 {
    coef_index[i] = (coefs_word >> (i * 4)) & 0x0f;
    shift_factor[i] = (shifts_word >> (i * 4)) & 0x0f;
  }

  let mut sample_count = 0usize;
  for group in 0..8 {
    let (coef1, coef2) = COEFS[(coef_index[group] % 7) as usize];
    let shift = 0x16 - shift_factor[group] as i32;
    let group_offset = BLOCK_HEADER_SIZE + group * 0x10;

    for word in 0..4 {
      let o = group_offset + word * 4;
      let nibbles = u32::from_le_bytes([block[o], block[o + 1], block[o + 2], block[o + 3]]);

      for nibble_index in 0..8 {
        let raw = (nibbles >> (nibble_index * 4)) & 0x0f;
        let mut sample = ((raw as i32) << 28) >> shift;
        sample = sample - hist2 * coef2 + hist1 * coef1;
        sample >>= 6;
        let clamped = clamp16(sample);

        if sample_count < max_samples {
          out.push(clamped);
        }
        sample_count += 1;

        hist2 = hist1;
        hist1 = clamped as i32;
      }
    }
  }
}

pub(crate) fn decode(channels: u8, sample_count: u32, data: &[u8]) -> Vec<i16> {
  let channels = channels.max(1) as usize;
  let sample_count = sample_count as usize;
  let num_frames = sample_count.div_ceil(BLOCK_SAMPLES);

  let mut per_channel: Vec<Vec<i16>> = vec![Vec::with_capacity(sample_count); channels];

  for frame in 0..num_frames {
    let already_decoded = frame * BLOCK_SAMPLES;
    let samples_in_frame = (sample_count - already_decoded).min(BLOCK_SAMPLES);

    for (ch, channel_out) in per_channel.iter_mut().enumerate() {
      let block_index = frame * channels + ch;
      let start = block_index * BLOCK_SIZE;
      let end = start + BLOCK_SIZE;

      if end > data.len() {
        // Truncated data: fall back to silence for whatever's missing
        // instead of panicking on a malformed/incomplete file.
        channel_out.resize(sample_count, 0);
        continue;
      }
      decode_block(&data[start..end], samples_in_frame, channel_out);
    }
  }

  let mut out = Vec::with_capacity(sample_count * channels);
  for i in 0..sample_count {
    for channel_out in &per_channel {
      out.push(*channel_out.get(i).unwrap_or(&0));
    }
  }
  out
}
