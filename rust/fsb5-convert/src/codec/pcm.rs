pub(crate) fn decode_pcm8(data: &[u8]) -> Vec<i16> {
  data.iter().map(|&b| (i16::from(b) - 128) << 8).collect()
}

pub(crate) fn decode_pcm16(data: &[u8]) -> Vec<i16> {
  data
    .chunks_exact(2)
    .map(|c| i16::from_le_bytes([c[0], c[1]]))
    .collect()
}

pub(crate) fn decode_pcm24(data: &[u8]) -> Vec<i16> {
  data
    .chunks_exact(3)
    .map(|c| {
      let sign_byte = if c[2] & 0x80 != 0 { 0xff } else { 0x00 };
      let signed = i32::from_le_bytes([c[0], c[1], c[2], sign_byte]);
      (signed >> 8) as i16
    })
    .collect()
}

pub(crate) fn decode_pcm32(data: &[u8]) -> Vec<i16> {
  data
    .chunks_exact(4)
    .map(|c| {
      let sample = i32::from_le_bytes([c[0], c[1], c[2], c[3]]);
      (sample >> 16) as i16
    })
    .collect()
}

pub(crate) fn decode_pcm_float(data: &[u8]) -> Vec<i16> {
  data
    .chunks_exact(4)
    .map(|c| {
      let sample = f32::from_le_bytes([c[0], c[1], c[2], c[3]]);
      let scaled = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round();
      scaled as i16
    })
    .collect()
}
