// AgroMax Modüler Donanım ve Backend Entegrasyon Adaptör Arayüzleri
// Gerçek donanım bağlı olmadığında sistem açıkça "BAĞLI DEĞİL" raporlar ve asla sahte bağlantı iddia etmez.

export type AdapterConnectionState = 'BAGLI_DEGIL' | 'YETKI_BEKLIYOR' | 'BAGLI';

export interface ISdrReceiverAdapter {
  readonly id: string;
  readonly protocol: 'RTL-SDR / SoapySDR' | 'USRP UHD' | 'DVB-S2 IP Receiver';
  getStatus(): { state: AdapterConnectionState; deviceName: string | null; reason: string };
  tuneFrequency(freqHz: number, bandwidthHz: number): Promise<boolean>;
}

export interface IAntennaRotatorAdapter {
  readonly id: string;
  readonly protocol: 'Hamlib rotctld (TCP:4533)' | 'ACU Serial/MODBUS';
  getStatus(): { state: AdapterConnectionState; azDeg: number | null; elDeg: number | null; reason: string };
  commandAzEl(azDeg: number, elDeg: number): Promise<boolean>;
}

export interface IDroneControlAdapter {
  readonly id: string;
  readonly protocol: 'MAVLink v2 / MAVSDK (PX4 & ArduPilot)' | 'QGroundControl Mission Plan' | 'Resmî DJI FlightHub / Cloud API';
  getStatus(): {
    state: AdapterConnectionState;
    vehicleId: string | null;
    operatorApprovalRequired: boolean;
    geofenceVerified: boolean;
    reason: string;
  };
  uploadMissionWithSafetyCheck(missionJson: string, operatorApproved: boolean): Promise<{ accepted: boolean; reason: string }>;
}

export interface IBackendIngestionAdapter {
  readonly endpointUrl: string;
  readonly stacCatalogUrl: string;
  getStatus(): { state: AdapterConnectionState; latencyMs: number | null; reason: string };
}

export const DEFAULT_HARDWARE_ADAPTERS = {
  sdr: {
    id: 'sdr-local-01',
    protocol: 'RTL-SDR / SoapySDR' as const,
    getStatus: () => ({
      state: 'BAGLI_DEGIL' as AdapterConnectionState,
      deviceName: null,
      reason: 'Tarayıcı/yerel köprü üzerinden fiziksel SDR cihazı algılanmadı.',
    }),
    tuneFrequency: async () => false,
  } satisfies ISdrReceiverAdapter,

  rotator: {
    id: 'rotctld-01',
    protocol: 'Hamlib rotctld (TCP:4533)' as const,
    getStatus: () => ({
      state: 'BAGLI_DEGIL' as AdapterConnectionState,
      azDeg: null,
      elDeg: null,
      reason: 'Anten kontrol ünitesi (ACU / rotctld) servisi bağlı değil.',
    }),
    commandAzEl: async () => false,
  } satisfies IAntennaRotatorAdapter,

  drone: {
    id: 'mavlink-gcs-01',
    protocol: 'MAVLink v2 / MAVSDK (PX4 & ArduPilot)' as const,
    getStatus: () => ({
      state: 'BAGLI_DEGIL' as AdapterConnectionState,
      vehicleId: null,
      operatorApprovalRequired: true,
      geofenceVerified: false,
      reason: 'Gerçek MAVLink/PX4 telemetri portu bağlı değil. Gerçek uçuş için operatör onayı ve coğrafi sınır doğrulaması zorunludur.',
    }),
    uploadMissionWithSafetyCheck: async (_missionJson: string, operatorApproved: boolean) => {
      if (!operatorApproved) {
        return { accepted: false, reason: 'Güvenlik kuralı: Gerçek İHA görev yüklemesi için operatör onayı zorunludur.' };
      }
      return { accepted: false, reason: 'Fiziksel MAVSDK/MAVLink köprüsü bağlı değil (SİMÜLASYON modu kullanın).' };
    },
  } satisfies IDroneControlAdapter,

  backend: {
    endpointUrl: 'ws://localhost:8000/ws/telemetry',
    stacCatalogUrl: 'http://localhost:8000/stac/v1',
    getStatus: () => ({
      state: 'BAGLI_DEGIL' as AdapterConnectionState,
      latencyMs: null,
      reason: 'Python FastAPI yerel veri işleme servisi çevrimdışı — çevrimdışı simülasyon motoru aktif.',
    }),
  } satisfies IBackendIngestionAdapter,
};

// Örnek Python FastAPI + Rasterio/NumPy + MAVSDK Backend Referans Mimarisi (Dağıtım için)
export const FASTAPI_REFERENCE_BLUEPRINT = `# agromax_server.py — AgroMax Yerel Sunucu Referans Mimarisi
# Gereksinimler: fastapi, uvicorn, numpy, rasterio, shapely, mavsdk
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel
import numpy as np

app = FastAPI(title="AgroMax Ground Station & Mission Core")

class SpectralRequest(BaseModel):
    dataset_id: str
    parcel_geojson: dict

@app.get("/api/health")
def health():
    return {"status": "online", "stac": "ready", "postgis": "configured"}

@app.post("/api/spectral/compute")
def compute_indices(req: SpectralRequest):
    # Örnek Rasterio/NumPy hesabı (bulut maskesi hariç)
    # ndvi = (nir - red) / np.where((nir + red) == 0, np.nan, (nir + red))
    # ndmi = (nir - swir) / np.where((nir + swir) == 0, np.nan, (nir + swir))
    return {"dataset_id": req.dataset_id, "indices": ["NDVI", "NDMI", "NDRE", "NDWI"]}

@app.websocket("/ws/telemetry")
async def telemetry_stream(ws: WebSocket):
    await ws.accept()
    # rotctld (Az/El), SoapySDR SNR ve MAVSDK İHA telemetri akışı
    await ws.send_json({"mode": "REAL_HARDWARE_BRIDGE", "connected": False})
`;
