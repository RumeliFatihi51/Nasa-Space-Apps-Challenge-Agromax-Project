import { shortestAngleDelta } from '../satellite/orbitMath';
import {
  FaultType,
  GroundStationHardwareProfile,
  OrbitTelemetry,
  RfTelemetry,
  SatelliteProfile,
} from '../shared/types';

export interface RfLinkInput {
  satellite: SatelliteProfile;
  hardware: GroundStationHardwareProfile;
  orbit: OrbitTelemetry;
  antennaAzDeg: number;
  antennaElDeg: number;
  activeFaults: FaultType[];
  prevReceivedMb: number;
  totalExpectedMb: number;
  dtSec: number;
  isReceivingStage: boolean;
}

/**
 * Evaluates physical RF link budget based on:
 * - Satellite elevation vs. hardware minimum horizon mask
 * - Frequency band compatibility (X-band vs Ku-band LNB)
 * - Mechanical pointing error (dish beamwidth roll-off)
 * - Free-space path loss (slant range & frequency)
 * - Injected atmospheric / misalignment / packet loss faults
 */
export function evaluateRfLink(input: RfLinkInput): RfTelemetry {
  const {
    satellite,
    hardware,
    orbit,
    antennaAzDeg,
    antennaElDeg,
    activeFaults,
    prevReceivedMb,
    totalExpectedMb,
    dtSec,
    isReceivingStage,
  } = input;

  const hardwareCompatible = hardware.supportedBands.includes(satellite.band);
  const incompatibilityReason = hardwareCompatible
    ? null
    : `${satellite.shortName} (${satellite.band === 'X_BAND' ? 'X-Band 8.2 GHz' : 'Ku-Band'}) doğrudan alımı için "${hardware.name}" uygun değildir. ${satellite.requiredStationClass} gerekir.`;

  const azErr = Math.abs(shortestAngleDelta(orbit.azimuthDeg, antennaAzDeg));
  const elErr = Math.abs(orbit.elevationDeg - antennaElDeg);
  const pointingErrorDeg = Math.sqrt(azErr * azErr + elErr * elErr);

  const losActive = orbit.isAboveHorizon && orbit.elevationDeg >= hardware.minElevationDeg && !activeFaults.includes('LOS_LOSS');

  if (!losActive || !hardwareCompatible) {
    const reasonSignal = !losActive ? -125.0 : -118.0;
    return {
      signalDbm: reasonSignal,
      snrDb: 0,
      ber: 0.5,
      pointingErrorDeg,
      packetLossPct: 100,
      dataRateMbps: 0,
      receivedMb: prevReceivedMb,
      totalExpectedMb,
      completionPct: (prevReceivedMb / Math.max(1, totalExpectedMb)) * 100,
      carrierLocked: false,
      hardwareCompatible,
      incompatibilityReason,
      queueDepth: 0,
    };
  }

  // Free-space path loss FSPL = 92.45 + 20log10(d_km) + 20log10(f_GHz)
  const fsplDb = 92.45 + 20 * Math.log10(Math.max(100, orbit.slantRangeKm)) + 20 * Math.log10(satellite.frequencyGHz);

  // Dish off-axis pointing loss: L = 12 * (theta / HPBW)^2 dB (capped at 35 dB)
  const effectiveError = activeFaults.includes('ANTENNA_MISALIGNMENT') ? Math.max(pointingErrorDeg, 14.0) : pointingErrorDeg;
  const pointingLossDb = Math.min(35, 12 * Math.pow(effectiveError / Math.max(0.4, hardware.beamwidthDeg), 2));

  // Atmospheric / Rain Fade attenuation
  const elevFactor = 1 / Math.max(0.15, Math.sin((orbit.elevationDeg * Math.PI) / 180));
  const atmosphericLossDb = 0.6 * elevFactor + (activeFaults.includes('RF_ATTENUATION') ? 12.0 : 0);

  // Nominal EIRP ~ 52 dBm for LEO X/Ku downlink
  const satEirpDbm = satellite.band === 'X_BAND' ? 54.0 : 51.5;
  const signalDbm = satEirpDbm - fsplDb + hardware.gainDbi - pointingLossDb - atmosphericLossDb + 58; // calibrated receiver front-end gain

  // Thermal noise floor ~ -106 dBm
  const noiseFloorDbm = -106.0;
  const snrDb = Math.max(0, signalDbm - noiseFloorDbm);

  // Carrier lock requires SNR >= 6.5 dB and pointing error <= 3.5 deg
  const carrierLocked = snrDb >= 6.5 && effectiveError <= 3.5;

  // BER curve derived from Eb/N0 / SNR
  const ber = carrierLocked
    ? Math.max(1e-9, Math.min(1e-2, Math.pow(10, -Math.max(2, snrDb * 0.42))))
    : 0.45;

  // Packet loss from low SNR or injected PACKET_LOSS fault
  let packetLossPct = 0;
  if (!carrierLocked) {
    packetLossPct = 100;
  } else {
    const baseLoss = snrDb < 10 ? (10 - snrDb) * 3.5 : 0.08;
    packetLossPct = Math.min(95, baseLoss + (activeFaults.includes('PACKET_LOSS') ? 28.0 : 0));
  }

  // Throughput scales with link quality and satellite nominal rate
  const linkEfficiency = carrierLocked ? Math.max(0.1, 1 - packetLossPct / 100) * (activeFaults.includes('RF_ATTENUATION') ? 0.45 : 1.0) : 0;
  const dataRateMbps = isReceivingStage && carrierLocked ? Number((satellite.dataRateMbps * linkEfficiency).toFixed(2)) : 0;

  let receivedMb = prevReceivedMb;
  if (isReceivingStage && carrierLocked && dtSec > 0) {
    // Scaled simulation throughput so a full product (~480 MB) transfers smoothly over ~10-14s at 1x speed
    const effectiveSimMbPerSec = (dataRateMbps / 8) * 1.45;
    receivedMb = Math.min(totalExpectedMb, prevReceivedMb + effectiveSimMbPerSec * dtSec);
  }

  if (activeFaults.includes('INCOMPLETE_IMAGE')) {
    receivedMb = Math.min(receivedMb, totalExpectedMb * 0.78);
  }

  const completionPct = Math.min(100, (receivedMb / Math.max(1, totalExpectedMb)) * 100);
  const queueDepth = isReceivingStage && carrierLocked ? Math.max(1, Math.round((totalExpectedMb - receivedMb) / 24)) : 0;

  return {
    signalDbm: Number(signalDbm.toFixed(1)),
    snrDb: Number(snrDb.toFixed(1)),
    ber,
    pointingErrorDeg: Number(pointingErrorDeg.toFixed(2)),
    packetLossPct: Number(packetLossPct.toFixed(2)),
    dataRateMbps,
    receivedMb: Number(receivedMb.toFixed(1)),
    totalExpectedMb,
    completionPct: Number(completionPct.toFixed(1)),
    carrierLocked,
    hardwareCompatible,
    incompatibilityReason,
    queueDepth,
  };
}
