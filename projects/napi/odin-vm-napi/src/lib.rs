//! Node-API bindings for OdinVM module loading and export invocation.
//!
//! This crate only moves bytes and values across the host boundary: the bytecode
//! engine, the JSON bridge and the workload helpers all live in the `odin-vm`
//! facade. Structured arguments and results are materialized strictly through the
//! ABI sidecar published next to the artifact; there is no fallback path.

#![deny(missing_docs)]

use std::{fs, path::Path};

use data_binary_odin::{OvmAbiSidecar, ovm_abi_sidecar_file};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use odin_vm::{OdinVm, json_bridge};

/// Host protocol id shared with the TypeScript wrapper.
pub const OVM_HOST_PROTOCOL: &str = "odin-vm/0";

/// Binding identity exposed to the host.
#[napi(object)]
pub struct OvmBindingInfo {
    /// Binding crate name.
    pub binding: String,
    /// Host protocol id.
    pub protocol: String,
}

/// Return binding identity.
#[napi]
pub fn ovm_binding_info() -> OvmBindingInfo {
    OvmBindingInfo { binding: "odin-vm-napi".to_string(), protocol: OVM_HOST_PROTOCOL.to_string() }
}

fn read_module(module: &Path) -> Result<Vec<u8>> {
    fs::read(module).map_err(|error| Error::from_reason(format!("read module `{}`: {error}", module.display())))
}

fn load_abi_sidecar(module: &Path, artifact_bytes: &[u8]) -> Result<OvmAbiSidecar> {
    let artifact = module.file_name().and_then(|name| name.to_str()).unwrap_or_default();
    let sidecar_path = module.with_file_name(ovm_abi_sidecar_file(artifact));
    let sidecar_bytes = fs::read(&sidecar_path).map_err(|error| {
        Error::from_reason(format!(
            "OVM ABI contract missing: `{}` ({error}); refusing to materialize structured arguments/returns without a contract",
            sidecar_path.display()
        ))
    })?;
    let sidecar: OvmAbiSidecar = serde_json::from_slice(&sidecar_bytes)
        .map_err(|error| Error::from_reason(format!("parse OVM ABI contract `{}`: {error}", sidecar_path.display())))?;
    sidecar
        .verify_against(artifact_bytes)
        .map_err(|error| Error::from_reason(format!("verify OVM ABI contract `{}`: {error}", sidecar_path.display())))?;
    Ok(sidecar)
}

/// List exported symbol names of an `.odin` module.
#[napi]
pub fn ovm_list_exports(module_path: String) -> Result<Vec<String>> {
    let bytes = read_module(Path::new(&module_path))?;
    let loaded = OdinVm::new().load(&bytes).map_err(|error| Error::from_reason(format!("load module: {error}")))?;
    Ok(loaded.exports.iter().map(|export| export.symbol_name.clone()).collect())
}

/// Invoke an `.odin` export; `args_json` is a JSON array and the result is JSON encoded.
///
/// Calls are rejected when the ABI sidecar next to the artifact is missing,
/// unparsable, or does not match the artifact hash.
#[napi]
pub fn ovm_invoke(module_path: String, entry: String, args_json: String) -> Result<String> {
    let module = Path::new(&module_path);
    let bytes = read_module(module)?;
    let sidecar = load_abi_sidecar(module, &bytes)?;
    let export = sidecar
        .contract
        .export(&entry)
        .ok_or_else(|| Error::from_reason(format!("OVM ABI contract has no export `{entry}`; refusing to materialize undeclared structured arguments/returns")))?;
    let mut vm = OdinVm::new();
    let loaded = vm.load(&bytes).map_err(|error| Error::from_reason(format!("load module: {error}")))?;
    let args = json_bridge::parse_call_args_json_with_contract(&args_json, export, vm.heap_mut())
        .map_err(|error| Error::from_reason(format!("parse args-json: {error}")))?;
    let result = vm.run(&loaded, &entry, args).map_err(|error| Error::from_reason(format!("run entry `{entry}`: {error}")))?;
    let json = json_bridge::value_to_json_with_contract(&result, &export.returns, vm.heap())
        .map_err(|error| Error::from_reason(format!("serialize result: {error}")))?;
    serde_json::to_string(&json).map_err(|error| Error::from_reason(format!("encode result json: {error}")))
}
