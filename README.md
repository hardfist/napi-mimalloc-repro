# napi-rs mimalloc physical-copy repro

Minimal napi-rs addon for reproducing the macOS fixed TLS slot issue in
mimalloc v3 when two physical copies of the same native addon are loaded in one
Node.js process.

The Rust addon uses:

```rust
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[napi_derive::module_init]
fn init() {
  touch_mimalloc();
}
```

The probe copies the built `.node` file to two different physical files and
loads both:

```js
require('/tmp/.../a.node');
require('/tmp/.../b.node');
```

## Run

```bash
npm install
npm test
```

Expected on macOS arm64:

```text
single-source      ok
same-source-twice  ok
copied-a-b         signal SIGSEGV
hardlink-a-c       ok
```

`same-source-twice` and `hardlink-a-c` are controls: they load the same physical
image. `copied-a-b` loads two separate images with identical bytes.

## Local Segfault Script

To make the crash happen in the current Node.js process instead of capturing it
from a child process:

```bash
npm run segfault
```

This builds the addon, copies the generated `.node` file to `.segfault/a.node`
and `.segfault/b.node`, then loads both copies directly. On affected macOS
machines the process should terminate while loading the second copy:

```text
requiring second physical copy; macOS should segfault here
Segmentation fault: 11
```

## Why This Matters

mimalloc v3 uses fixed TLS slots on macOS arm64/x64:

```c
#define MI_TLS_MODEL_FIXED_SLOT 1
#define MI_TLS_MODEL_FIXED_SLOT_DEFAULT 108
#define MI_TLS_MODEL_FIXED_SLOT_CACHED 109
```

Two physically distinct addon images have separate mimalloc global state, but
both images access the same process/thread TLS slots. This can make the second
image observe TLS state created by the first image during module load.
