use core::fmt;

use crate::codec::Codec;

/// Everything that can go wrong while parsing an FSB5 bank or decoding one
/// of its samples.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fsb5Error {
  /// The file does not start with the `FSB5` magic bytes.
  NotFsb5,
  /// The file's `version` field is not one this crate understands.
  UnsupportedVersion(u32),
  /// The buffer ended before a field/struct we expected could be read.
  UnexpectedEof(&'static str),
  /// A sample used a codec we don't have a decoder for.
  UnsupportedCodec(Codec),
  /// `decode_sample`/`sample` was called with an out-of-range index.
  SampleIndexOutOfRange { index: usize, len: usize },
  /// A sample's compressed data was shorter than its own header implied.
  TruncatedSampleData { sample: String },
}

impl fmt::Display for Fsb5Error {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Fsb5Error::NotFsb5 => write!(f, "not an FSB5 file (missing 'FSB5' magic)"),
      Fsb5Error::UnsupportedVersion(v) => write!(f, "unsupported FSB5 header version: {v}"),
      Fsb5Error::UnexpectedEof(ctx) => write!(f, "unexpected end of file while reading {ctx}"),
      Fsb5Error::UnsupportedCodec(codec) => {
        write!(f, "unsupported codec: {codec:?} (only FADPCM and PCM8/16/24/32/float are decoded)")
      }
      Fsb5Error::SampleIndexOutOfRange { index, len } => {
        write!(f, "sample index {index} out of range (bank has {len} sample(s))")
      }
      Fsb5Error::TruncatedSampleData { sample } => {
        write!(f, "sample '{sample}' data is shorter than its header claims")
      }
    }
  }
}

impl std::error::Error for Fsb5Error {}
