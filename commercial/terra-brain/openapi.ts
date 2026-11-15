import { z } from "zod";
import { importInput, runInput } from "./kernel";

const id = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });
const parameter = (name: string, type: string, required = false) => ({ name, in: "query", required, schema: { type } });
const season = parameter("season", "integer", true);
const page = [season, parameter("limit", "integer"), parameter("cursor", "string")];
const describe = (description: string) => ({ description });
const errors = {
  "400": describe("Sözleşme doğrulaması başarısız."),
  "401": describe("AgroMax oturumu gerekli."),
  "403": describe("Yetki veya pilot erişimi bulunamadı."),
  "404": describe("Bu işletmede kayıt bulunamadı."),
};
const body = (schema: z.ZodType) => ({ required: true, content: {
  "application/json": { schema: z.toJSONSchema(schema, { io: "input" }) },
} });
const key = { name: "Idempotency-Key", in: "header", schema: { type: "string" } };
const write = {
  ...errors, "202": { description: "Kalıcı iş kabul edildi.", content: { "application/json": { schema: {
    type: "object", required: ["job"], properties: { job: { type: "object", required: ["id", "state"], properties: {
      id: { type: "string" }, state: { enum: ["queued", "running", "succeeded", "failed", "canceled"] },
    } } },
  } } } },
  "409": describe("İstek anahtarı çakışması veya değişen geometri."),
  "422": describe("Bilimsel veri kabulü başarısız."),
  "429": describe("İşletme kuyruk sınırına ulaştı."),
};

export function openApi() {
  return {
    openapi: "3.1.0",
    info: { title: "AgroMax Terra Brain", version: "1.0.0" },
    servers: [{ url: "/api/v1/terra-brain" }],
    security: [{ existingSession: [] }, { workspaceSession: [] }],
    components: { securitySchemes: {
      existingSession: { type: "apiKey", in: "cookie", name: "session" },
      workspaceSession: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
    } },
    paths: {
      "/status": { get: { responses: { ...errors, "200": describe("İşletme ve pilot durumu.") } } },
      "/fields/{fieldId}/demo-balance": { get: { parameters: [id("fieldId"), {
        name: "irrigation", in: "query", schema: {type: "integer", minimum: 0, maximum: 80},
      }], responses: { ...errors, "200": describe("Sentetik girdilerle hesaplanan iki sulama planı.") } } },
      "/fields/{fieldId}/imports": { post: { parameters: [id("fieldId"), key, parameter("dryRun", "boolean")],
        requestBody: body(importInput),
        responses: { ...write, "200": describe("Kuru kontrol. Kayıt oluşturulmadı.") } } },
      "/fields/{fieldId}/runs": {
        post: { parameters: [id("fieldId"), { ...key, required: true }], requestBody: body(runInput), responses: write },
        get: { parameters: [id("fieldId"), ...page], responses: { ...errors, "200": describe("Koşum özetleri.") } },
      },
      ...Object.fromEntries(["observations", "twin", "forecasts", "research", "jobs"].map(name => [
        "/fields/{fieldId}/" + name, { get: { parameters: [id("fieldId"),
          ...(name === "twin" ? [parameter("season", "integer")] : page)],
          responses: { ...errors, "200": describe("Parsel ve sezon kapsamındaki kayıtlar.") } } },
      ])),
      "/jobs/{id}": { get: { parameters: [id("id")],
        responses: { ...errors, "200": describe("İş durumu ve mevcut sonuç.") } } },
      "/jobs/{id}/cancel": { post: { parameters: [id("id")],
        responses: { ...errors, "200": describe("İş iptal edildi."), "409": describe("İş daha önce sonlandı.") } } },
      "/jobs/{id}/report": { get: { parameters: [id("id")],
        responses: { ...errors, "200": describe("Sürümlü JSON araştırma raporu."), "409": describe("Rapor hazır değil.") } } },
    },
  };
}
