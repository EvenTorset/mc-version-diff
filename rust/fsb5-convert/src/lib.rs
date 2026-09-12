mod codec;
mod error;
mod header;
mod wav;

use wasm_bindgen::prelude::*;

pub use codec::Codec;
pub use error::Fsb5Error;

#[derive(Debug)]
pub struct Fsb5Bank<'a> {
  inner: header::Fsb5<'a>,
}

#[derive(Debug, Clone)]
pub struct DecodedSample {
  pub name: String,
  pub sample_rate: u32,
  pub channels: u16,
  /// Interleaved 16-bit signed PCM
  pub pcm: Vec<i16>,
}

impl DecodedSample {
  pub fn to_wav_bytes(&self) -> Vec<u8> {
    wav::write_wav(self.channels, self.sample_rate, &self.pcm)
  }
}

#[derive(Debug, Clone, Copy)]
pub struct SampleMeta<'a> {
  pub name: &'a str,
  pub frequency: u32,
  pub channels: u8,
  pub sample_count: u32,
}

impl<'a> Fsb5Bank<'a> {
  pub fn parse(data: &'a [u8]) -> Result<Self, Fsb5Error> {
    Ok(Fsb5Bank { inner: header::parse(data)? })
  }

  pub fn version(&self) -> u32 {
    self.inner.version
  }

  pub fn codec(&self) -> Codec {
    self.inner.codec
  }

  pub fn sample_count(&self) -> usize {
    self.inner.samples.len()
  }

  pub fn sample_meta(&self, index: usize) -> Result<SampleMeta<'_>, Fsb5Error> {
    let s = self.inner.samples.get(index).ok_or(Fsb5Error::SampleIndexOutOfRange {
      index,
      len: self.inner.samples.len(),
    })?;
    Ok(SampleMeta { name: &s.name, frequency: s.frequency, channels: s.channels, sample_count: s.sample_count })
  }

  pub fn decode_sample(&self, index: usize) -> Result<DecodedSample, Fsb5Error> {
    let sample = self.inner.samples.get(index).ok_or(Fsb5Error::SampleIndexOutOfRange {
      index,
      len: self.inner.samples.len(),
    })?;

    let pcm = codec::decode_to_pcm16(self.inner.codec, sample.channels, sample.sample_count, sample.data)?;

    Ok(DecodedSample {
      name: sample.name.clone(),
      sample_rate: sample.frequency,
      channels: sample.channels as u16,
      pcm,
    })
  }

  pub fn convert_all(&self) -> Result<Vec<(String, Vec<u8>)>, Fsb5Error> {
    (0..self.sample_count())
      .map(|i| self.decode_sample(i).map(|s| (s.name.clone(), s.to_wav_bytes())))
      .collect()
  }
}

// MARK: WASM bindings

#[wasm_bindgen]
pub struct ConvertedSample {
  name: String,
  bytes: Vec<u8>,
}

#[wasm_bindgen]
impl ConvertedSample {
  #[wasm_bindgen(getter)]
  pub fn name(&self) -> String {
    self.name.clone()
  }

  #[wasm_bindgen(getter)]
  pub fn bytes(&self) -> Vec<u8> {
    self.bytes.clone()
  }
}

#[wasm_bindgen(js_name = convertFsb5)]
pub fn convert_fsb5(data: &[u8]) -> Result<js_sys::Array, JsValue> {
  let bank = Fsb5Bank::parse(data).map_err(|e| JsValue::from_str(&e.to_string()))?;

  let out = js_sys::Array::new();
  for i in 0..bank.sample_count() {
    let decoded = bank.decode_sample(i).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let bytes = decoded.to_wav_bytes();
    let converted = ConvertedSample { name: decoded.name, bytes };
    out.push(&JsValue::from(converted));
  }
  Ok(out)
}
