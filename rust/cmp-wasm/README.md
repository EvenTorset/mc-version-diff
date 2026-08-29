# cmp-wasm

The comparison worker's inner loop. One call compares a whole batch: inflating
each zip entry, comparing PNGs by pixel through
[png-pixel-cmp](https://github.com/EvenTorset/png-pixel-cmp), and comparing NBT
with the DataVersion masked out.

The built output is committed to `src/comparison/wasm`, so building the site
does not need a Rust toolchain. After changing anything here, rebuild it with:

```
wasm-pack build --target web --release --out-dir ../../src/comparison/wasm --out-name cmp_wasm
```

then delete the `.gitignore`, `package.json` and `README.md` that wasm-pack
writes into the output directory.
