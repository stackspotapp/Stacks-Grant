import { describe, it, expect } from 'vitest';
import { Cl } from '@stacks/transactions';
import { hexToBytes } from '@stacks/common';

describe('stackspot-vrf', () => {
  it('should extract lower 16 bytes in little-endian format', async () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get('deployer')!;

    // Test with a known 32-byte buffer
    const testBuffer = hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');

    const result = simnet.callReadOnlyFn(
      'stackspot-vrf',
      'lower-16-le',
      [Cl.buffer(testBuffer)],
      deployer
    );

    // The lower 16 bytes should be the last 16 bytes of the buffer
    const expectedLower16 = hexToBytes('101112131415161718191a1b1c1d1e1f');

    expect(result.result).toBeBuff(expectedLower16);
  });

  it('should return correct buffer from lower-16-le bytes', async () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get('deployer')!;

    // Test with zeros in upper bytes and 0x01 at start of lower 16 bytes
    const testBuffer = hexToBytes('0000000000000000000000000000000001000000000000000000000000000000');

    const result = simnet.callReadOnlyFn(
      'stackspot-vrf',
      'lower-16-le',
      [Cl.buffer(testBuffer)],
      deployer
    );

    // Lower 16 bytes as buffer
    const expectedBuffer = hexToBytes('01000000000000000000000000000000');
    expect(result.result).toBeBuff(expectedBuffer);
  });

  it('should handle all zeros', async () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get('deployer')!;

    const testBuffer = hexToBytes('0000000000000000000000000000000000000000000000000000000000000000');

    const result = simnet.callReadOnlyFn(
      'stackspot-vrf',
      'lower-16-le',
      [Cl.buffer(testBuffer)],
      deployer
    );

    const expectedBuffer = hexToBytes('00000000000000000000000000000000');
    expect(result.result).toBeBuff(expectedBuffer);
  });

  it('should handle max value in lower 16 bytes', async () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get('deployer')!;

    // All 0xff in lower 16 bytes
    const testBuffer = hexToBytes('00000000000000000000000000000000ffffffffffffffffffffffffffffffff');

    const result = simnet.callReadOnlyFn(
      'stackspot-vrf',
      'lower-16-le',
      [Cl.buffer(testBuffer)],
      deployer
    );

    const expectedBuffer = hexToBytes('ffffffffffffffffffffffffffffffff');
    expect(result.result).toBeBuff(expectedBuffer);
  });

  it('should ignore upper 16 bytes', async () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get('deployer')!;

    // Different upper bytes, same lower bytes should give same result
    const testBuffer1 = hexToBytes('ffffffffffffffffffffffffffffffff0a000000000000000000000000000000');
    const testBuffer2 = hexToBytes('000000000000000000000000000000000a000000000000000000000000000000');

    const result1 = simnet.callReadOnlyFn(
      'stackspot-vrf',
      'lower-16-le',
      [Cl.buffer(testBuffer1)],
      deployer
    );

    const result2 = simnet.callReadOnlyFn(
      'stackspot-vrf',
      'lower-16-le',
      [Cl.buffer(testBuffer2)],
      deployer
    );

    // Both should return the same 16-byte buffer
    const expectedBuffer = hexToBytes('0a000000000000000000000000000000');
    expect(result1.result).toBeBuff(expectedBuffer);
    expect(result2.result).toBeBuff(expectedBuffer);
  });

  it('should correctly reverse byte order for little-endian', async () => {
    const accounts = simnet.getAccounts();
    const deployer = accounts.get('deployer')!;

    // Test specific byte pattern to verify little-endian ordering
    const testBuffer = hexToBytes('00000000000000000000000000000000aabbccddeeff00112233445566778899');

    const result = simnet.callReadOnlyFn(
      'stackspot-vrf',
      'lower-16-le',
      [Cl.buffer(testBuffer)],
      deployer
    );

    // Lower 16 bytes extracted
    const expectedBuffer = hexToBytes('aabbccddeeff00112233445566778899');
    expect(result.result).toBeBuff(expectedBuffer);
  });
});