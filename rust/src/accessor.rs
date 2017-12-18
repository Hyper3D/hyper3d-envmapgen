/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
//! Defines the `SliceAccessor` type that can be used to bypass bounds checking
//! on the release builds.

use std::{ops, convert};

#[cfg(not(debug_assertions))]
use std::slice;

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Clone, Copy)]
pub struct SliceAccessor<T> {
    slice: T,
}

impl<T> SliceAccessor<T> {
    pub unsafe fn new(x: T) -> Self {
        SliceAccessor { slice: x }
    }
}

impl<'a, T> convert::Into<SliceAccessor<&'a [T]>> for SliceAccessor<&'a mut [T]> {
    fn into(self) -> SliceAccessor<&'a [T]> {
        unsafe { SliceAccessor::new(self.slice) }
    }
}

impl<T> ops::Deref for SliceAccessor<T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        &self.slice
    }
}

impl<T> ops::DerefMut for SliceAccessor<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.slice
    }
}

#[cfg(not(debug_assertions))]
impl<'a, T, I> ops::Index<I> for SliceAccessor<&'a [T]>
where
    I: slice::SliceIndex<[T]>,
{
    type Output = I::Output;
    fn index(&self, index: I) -> &Self::Output {
        unsafe { self.slice.get_unchecked(index) }
    }
}

#[cfg(not(debug_assertions))]
impl<'a, T, I> ops::Index<I> for SliceAccessor<&'a Vec<T>>
where
    I: slice::SliceIndex<[T]>,
{
    type Output = I::Output;
    fn index(&self, index: I) -> &Self::Output {
        unsafe { self.slice.get_unchecked(index) }
    }
}

#[cfg(not(debug_assertions))]
impl<'a, T, I> ops::Index<I> for SliceAccessor<&'a mut [T]>
where
    I: slice::SliceIndex<[T]>,
{
    type Output = I::Output;
    fn index(&self, index: I) -> &Self::Output {
        unsafe { self.slice.get_unchecked(index) }
    }
}

#[cfg(not(debug_assertions))]
impl<'a, T, I> ops::IndexMut<I> for SliceAccessor<&'a mut [T]>
where
    I: slice::SliceIndex<[T]>,
{
    fn index_mut(&mut self, index: I) -> &mut Self::Output {
        unsafe { self.slice.get_unchecked_mut(index) }
    }
}

#[cfg(not(debug_assertions))]
impl<'a, T, I> ops::Index<I> for SliceAccessor<&'a mut Vec<T>>
where
    I: slice::SliceIndex<[T]>,
{
    type Output = I::Output;
    fn index(&self, index: I) -> &Self::Output {
        unsafe { self.slice.get_unchecked(index) }
    }
}

#[cfg(not(debug_assertions))]
impl<'a, T, I> ops::IndexMut<I> for SliceAccessor<&'a mut Vec<T>>
where
    I: slice::SliceIndex<[T]>,
{
    fn index_mut(&mut self, index: I) -> &mut Self::Output {
        unsafe { self.slice.get_unchecked_mut(index) }
    }
}
