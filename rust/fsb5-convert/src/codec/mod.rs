mod fadpcm;
mod pcm;

use crate::error::Fsb5Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Codec {
  None,
  Pcm8,
  Pcm16,
  Pcm24,
  Pcm32,
  PcmFloat,
  GcAdpcm,
  ImaAdpcm,
  Vag,
  HeVag,
  Xma,
  Mpeg,
  Celt,
  At9,
  XWma,
  Vorbis,
  FAdpcm,
  Opus,
  Unknown(u32),
}

impl Codec {
  pub(crate) fn from_u32(value: u32) -> Codec {
    match value {
      0 => Codec::None,
      1 => Codec::Pcm8,
      2 => Codec::Pcm16,
      3 => Codec::Pcm24,
      4 => Codec::Pcm32,
      5 => Codec::PcmFloat,
      6 => Codec::GcAdpcm,
      7 => Codec::ImaAdpcm,
      8 => Codec::Vag,
      9 => Codec::HeVag,
      10 => Codec::Xma,
      11 => Codec::Mpeg,
      12 => Codec::Celt,
      13 => Codec::At9,
      14 => Codec::XWma,
      15 => Codec::Vorbis,
      16 => Codec::FAdpcm,
      17 => Codec::Opus,
      other => Codec::Unknown(other),
    }
  }
}

pub(crate) fn decode_to_pcm16(
  codec: Codec,
  channels: u8,
  sample_count: u32,
  data: &[u8],
) -> Result<Vec<i16>, Fsb5Error> {
  match codec {
    Codec::Pcm8 => Ok(pcm::decode_pcm8(data)),
    Codec::Pcm16 => Ok(pcm::decode_pcm16(data)),
    Codec::Pcm24 => Ok(pcm::decode_pcm24(data)),
    Codec::Pcm32 => Ok(pcm::decode_pcm32(data)),
    Codec::PcmFloat => Ok(pcm::decode_pcm_float(data)),
    Codec::FAdpcm => Ok(fadpcm::decode(channels, sample_count, data)),
    other => Err(Fsb5Error::UnsupportedCodec(other)),
  }
}
