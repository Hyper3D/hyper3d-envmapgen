/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
//! Provides cube map face definitions.
use std::ops;
use cgmath::{Vector3, Matrix4};
use cgmath::num_traits::NumCast;
use cgmath::prelude::*;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum CubeFace {
    PositiveX = 0,
    NegativeX = 1,
    PositiveY = 2,
    NegativeY = 3,
    PositiveZ = 4,
    NegativeZ = 5,
}

pub static CUBE_FACES: [CubeFace; 6] = [
    CubeFace::PositiveX,
    CubeFace::NegativeX,
    CubeFace::PositiveY,
    CubeFace::NegativeY,
    CubeFace::PositiveZ,
    CubeFace::NegativeZ,
];

impl CubeFace {
    pub unsafe fn from_ordinal_unchecked(i: usize) -> CubeFace {
        use std::mem::transmute;
        transmute(i as u8)
    }

    pub fn from_ordinal(i: usize) -> Option<CubeFace> {
        if i < 6 {
            Some(unsafe { Self::from_ordinal_unchecked(i) })
        } else {
            None
        }
    }

    pub fn as_ordinal(&self) -> usize {
        (*self) as usize
    }

    pub fn u_face(&self) -> CubeFace {
        match self {
            &CubeFace::PositiveX => CubeFace::NegativeZ,
            &CubeFace::NegativeX => CubeFace::PositiveZ,
            &CubeFace::PositiveY => CubeFace::PositiveX,
            &CubeFace::NegativeY => CubeFace::PositiveX,
            &CubeFace::PositiveZ => CubeFace::PositiveX,
            &CubeFace::NegativeZ => CubeFace::NegativeX,
        }
    }

    pub fn v_face(&self) -> CubeFace {
        match self {
            &CubeFace::PositiveX => CubeFace::NegativeY,
            &CubeFace::NegativeX => CubeFace::NegativeY,
            &CubeFace::PositiveY => CubeFace::PositiveZ,
            &CubeFace::NegativeY => CubeFace::NegativeZ,
            &CubeFace::PositiveZ => CubeFace::NegativeY,
            &CubeFace::NegativeZ => CubeFace::NegativeY,
        }
    }

    pub fn u_vec<T: NumCast>(&self) -> Vector3<T> {
        self.u_face().normal()
    }

    pub fn v_vec<T: NumCast>(&self) -> Vector3<T> {
        self.v_face().normal()
    }

    pub fn normal<T: NumCast>(&self) -> Vector3<T> {
        match self {
            &CubeFace::PositiveX => Vector3::new(1, 0, 0),
            &CubeFace::NegativeX => Vector3::new(-1, 0, 0),
            &CubeFace::PositiveY => Vector3::new(0, 1, 0),
            &CubeFace::NegativeY => Vector3::new(0, -1, 0),
            &CubeFace::PositiveZ => Vector3::new(0, 0, 1),
            &CubeFace::NegativeZ => Vector3::new(0, 0, -1),
        }.cast()
    }

    pub fn info(&self) -> &'static CubeFaceInfo {
        &CUBE_FACE_INFOS[*self as usize]
    }

    pub fn abs(&self) -> Self {
        unsafe {
            Self::from_ordinal_unchecked(self.as_ordinal() & !1)
        }
    }
}

impl ops::Neg for CubeFace {
    type Output = Self;
    fn neg(self) -> Self {
        unsafe {
            Self::from_ordinal_unchecked(self.as_ordinal() ^ 1)
        }
    }
}

pub struct CubeFaceInfo {
    pub view_proj_mat: Matrix4<f32>,
    pub inv_view_proj_mat: Matrix4<f32>,
}

lazy_static! {
    pub static ref CUBE_FACE_INFOS: Vec<CubeFaceInfo> = CUBE_FACES.iter()
        .map(|face| {
            let u = face.u_vec();
            let v = face.v_vec();
            let n = face.normal();
            let view_proj_mat = Matrix4::new(
                u[0], v[0], 0.0, n[0],
                u[1], v[1], 0.0, n[1],
                u[2], v[2], 0.0, n[2],
                0.0, 0.0, 1.0, 0.0,
            );
            let inv_view_proj_mat = view_proj_mat.invert().unwrap();
            CubeFaceInfo {
                view_proj_mat,
                inv_view_proj_mat,
            }
        })
        .collect();
}
