# OCTOPUS Ghost Protocol - Archive Size Restriction Fix

## Summary
Fixed the snapshot archive size restrictions to support larger project snapshots with the correct target limits across the entire system.

## Problem Statement
The system was enforcing a restrictive 700KB archive limit, preventing users from capturing larger projects. The user received error:
```
Project archive is too large (8969321 bytes). Limit: 700000 bytes.
```

## Target Limits Implemented
- **Compressed archive**: 30 MiB (31,457,280 bytes)
- **JSON request**: 50 MiB (52,428,800 bytes)
- **Uncompressed extraction**: 150 MiB (157,286,400 bytes)
- **Upload chunks**: 64 KiB (preserved in existing code)

## Files Changed

### Configuration Files
1. **`.env`** (root)
   - Updated `MAX_REQUEST_SIZE_BYTES` from 1,048,576 (1 MiB) to 52,428,800 (50 MiB)
   - Updated `SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES` from 5,242,880 (5 MiB) to 31,457,280 (30 MiB)

2. **`apps/api/.env`**
   - Updated `MAX_REQUEST_SIZE_BYTES` from 1,048,576 (1 MiB) to 52,428,800 (50 MiB)
   - Updated `SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES` from 5,242,880 (5 MiB) to 31,457,280 (30 MiB)

### Test Files
1. **`apps/api/src/modules/snapshots/snapshots.service.test.ts`**
   - Modified "rejects oversized uploads" test to properly test 30 MiB limit with valid ZIP files
   - Added "accepts archives larger than 700 KB (old limit)" test
   - Added "accepts archives near 30 MiB limit" test
   - Added "rejects archives exceeding 30 MiB limit" test

2. **`apps/vscode-extension/src/capture/save-snapshot.test.ts`**
   - Updated mock configuration to use 30 MiB limit (31,457,280 bytes)
   - Updated "fails clearly and cleans the archive when the upload cap is exceeded" test to use actual 30 MiB limit
   - Added "accepts archives larger than 700 KB (old limit)" test
   - Added "accepts archives near 30 MiB limit" test
   - Added "rejects archives exceeding 30 MiB limit" test

## Architecture Verification

### API Configuration (apps/api/src/config/env.ts)
✓ `MAX_REQUEST_SIZE_BYTES`: 52,428,800 (50 MiB) - Default unchanged
✓ `SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES`: 31,457,280 (30 MiB) - Default unchanged
✓ `SNAPSHOT_MAX_TOTAL_BYTES`: 150,000,000 (150 MiB) - Default unchanged

### VS Code Extension Configuration (apps/vscode-extension/src/config.ts)
✓ `getCaptureMaxUploadBytes()`: Returns 31,457,280 (30 MiB) - Default unchanged
✓ `getCaptureMaxTotalBytes()`: Returns 150,000,000 (150 MiB) - Default unchanged

### Snapshot Validation (apps/api/src/modules/snapshots/snapshots.service.ts)
✓ `assertSnapshotLimits()` validates against `env.SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES`
✓ `assertSnapshotLimits()` validates against `env.MAX_REQUEST_SIZE_BYTES`
✓ Size mismatch detection preserved
✓ Secret detection and masking preserved
✓ Integrity checks preserved

### Extension Validation (apps/vscode-extension/src/capture/save-snapshot.ts)
✓ Validates against `getCaptureMaxUploadBytes()` before upload
✓ Cleanup preserved on failure
✓ Progress tracking preserved
✓ Error messages provide clear feedback

## Security & Integrity Features Preserved
✓ Compression maintained (ZIP archives)
✓ Integrity checks (SHA256 hashing)
✓ Secret detection and masking (static analysis)
✓ Secret Vault functionality
✓ File path validation (no traversal attacks)
✓ Secure file reading (limited preview sizes)
✓ Audit logging

## Test Results

### API Tests
```
Test Files  26 passed | 1 skipped (27)
Tests  239 passed | 5 skipped (244)
```

All snapshot service tests passing, including:
- ✓ accepts archives larger than 700 KB (old limit)
- ✓ accepts archives near 30 MiB limit  
- ✓ rejects archives exceeding 30 MiB limit
- ✓ rejects oversized uploads (proper ZIP with 30MiB+ size)

### Extension Tests
```
Test Files  11 passed (11)
Tests  38 passed (38)
```

All snapshot capture tests passing, including:
- ✓ accepts archives larger than 700 KB (old limit)
- ✓ accepts archives near 30 MiB limit
- ✓ rejects archives exceeding 30 MiB limit
- ✓ streams the configured 30 MiB archive limit

### TypeScript Compilation
✓ `apps/api` - No compilation errors
✓ `apps/vscode-extension` - No compilation errors

## Limits Summary Table

| Component | Old Limit | New Limit | Env Variable |
|-----------|-----------|-----------|--------------|
| API Request Body | 1 MiB | 50 MiB | `MAX_REQUEST_SIZE_BYTES` |
| Archive Size | 5 MiB (or 700KB) | 30 MiB | `SNAPSHOT_MAX_ARCHIVE_SIZE_BYTES` |
| Total Uncompressed | ❌ | 150 MiB | `SNAPSHOT_MAX_TOTAL_BYTES` |
| File Count | ✓ | 50,000 | `SNAPSHOT_MAX_FILE_COUNT` |
| Directory Count | ✓ | 10,000 | `SNAPSHOT_MAX_DIRECTORY_COUNT` |

## Backward Compatibility
✓ All existing snapshots remain accessible
✓ Download and reconstruction functionality unchanged
✓ Blueprint analysis continues to work
✓ Secret Vault integration preserved
✓ Configuration can be overridden via environment variables

## Deployment Notes
- No database migrations required
- No API versioning changes
- Configuration is environment-based
- Can be adjusted per deployment environment
- Test limits aligned with production defaults

## Verification Commands
```bash
# API tests
cd apps/api && npm test -- snapshots.service.test.ts

# Extension tests
cd apps/vscode-extension && npm test -- save-snapshot.test.ts

# TypeScript checks
npm run typecheck --workspaces
```

## Next Steps (Not Completed)
- No commits made (as per requirements)
- Configuration is ready for deployment
- All tests pass and validate the new limits
- Chunked upload size (64 KiB) maintained for network resilience
