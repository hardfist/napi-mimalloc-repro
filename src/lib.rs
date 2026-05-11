use mimalloc::MiMalloc;
use napi_derive::napi;
use std::alloc::{alloc, dealloc, Layout};
use std::hint::black_box;
use std::ptr;
use std::sync::atomic::{AtomicUsize, Ordering};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

const ALIGN: usize = 16;
const ALLOC_SIZE: usize = 4096;
static INIT_COUNT: AtomicUsize = AtomicUsize::new(0);
static LAST_ALLOCATION: AtomicUsize = AtomicUsize::new(0);

#[napi_derive::module_init]
fn init() {
    INIT_COUNT.fetch_add(1, Ordering::Relaxed);
    touch_mimalloc();
}

#[napi]
pub fn touch() -> u32 {
    touch_mimalloc() as u32
}

#[napi]
pub fn init_count() -> u32 {
    INIT_COUNT.load(Ordering::Relaxed) as u32
}

#[napi]
pub fn last_allocation() -> String {
    format!("{:#x}", LAST_ALLOCATION.load(Ordering::Relaxed))
}

#[napi]
pub fn mimalloc_version() -> u32 {
    30301
}

fn touch_mimalloc() -> usize {
    let layout = Layout::from_size_align(ALLOC_SIZE, ALIGN).expect("valid layout");
    unsafe {
        let ptr = alloc(layout);
        if ptr.is_null() {
            panic!("mimalloc allocation failed");
        }

        ptr::write_volatile(ptr, 0x7b);
        black_box(ptr);
        LAST_ALLOCATION.store(ptr as usize, Ordering::Relaxed);
        dealloc(ptr, layout);
        ptr as usize
    }
}
