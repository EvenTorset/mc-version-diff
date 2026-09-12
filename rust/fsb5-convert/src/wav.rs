pub fn write_wav(channels: u16, sample_rate: u32, samples: &[i16]) -> Vec<u8> {
  let bytes_per_sample = 2u16;
  let block_align = channels * bytes_per_sample;
  let byte_rate = sample_rate * block_align as u32;
  let data_size = (samples.len() * bytes_per_sample as usize) as u32;
  let riff_size = 4 + (8 + 16) + (8 + data_size); // "WAVE" + fmt chunk + data chunk

  let mut out = Vec::with_capacity(8 + riff_size as usize);

  out.extend_from_slice(b"RIFF");
  out.extend_from_slice(&riff_size.to_le_bytes());
  out.extend_from_slice(b"WAVE");

  out.extend_from_slice(b"fmt ");
  out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
  out.extend_from_slice(&1u16.to_le_bytes()); // format tag: PCM
  out.extend_from_slice(&channels.to_le_bytes());
  out.extend_from_slice(&sample_rate.to_le_bytes());
  out.extend_from_slice(&byte_rate.to_le_bytes());
  out.extend_from_slice(&block_align.to_le_bytes());
  out.extend_from_slice(&(bytes_per_sample * 8).to_le_bytes()); // _bits_ per sample

  out.extend_from_slice(b"data");
  out.extend_from_slice(&data_size.to_le_bytes());
  out.reserve(samples.len() * 2);
  for &s in samples {
    out.extend_from_slice(&s.to_le_bytes());
  }

  out
}
