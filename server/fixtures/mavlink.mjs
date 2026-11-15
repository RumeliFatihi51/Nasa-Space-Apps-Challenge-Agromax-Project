// Explicit synthetic wire packets. The bitwise CRC implementation is independent
// of the streaming decoder's table-free byte recurrence.
export function mavlinkPacket(id, payload, { version = 2, system = 17, component = 1, signed = false } = {}) {
  const extra = {0:50,1:124,33:104,42:28}[id];
  const header = version===2 ? [0xfd,payload.length,signed?1:0,0,1,system,component,id,0,0]
    : [0xfe,payload.length,1,system,component,id];
  let crc = 65535;
  for (const byte of [...header.slice(1),...payload,extra]) {
    crc ^= byte;
    for (let bit=0;bit<8;bit++) crc = (crc>>1) ^ (crc&1 ? 0x8408 : 0);
  }
  return Uint8Array.from([...header,...payload,crc&255,crc>>8,...(signed?Array(13).fill(0):[])]);
}

export function telemetryPackets(options = {}) {
  const heartbeat = [0,0,0,0,2,12,0,3,3];
  const position = new Uint8Array(28), view = new DataView(position.buffer);
  view.setInt32(4,385005000,true);
  view.setInt32(8,275005000,true);
  view.setInt32(12,160000,true);
  view.setInt32(16,35000,true);
  view.setInt16(20,300,true);
  view.setInt16(22,400,true);
  view.setUint16(26,27000,true);
  const status = new Uint8Array(31);
  status[30]=72;
  return [mavlinkPacket(0,heartbeat,options),mavlinkPacket(33,position,options),mavlinkPacket(1,status,options),
    mavlinkPacket(42,options.version===1?[7,0]:[7,0,12,0,3],options)];
}
