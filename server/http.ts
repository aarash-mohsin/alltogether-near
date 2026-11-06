import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { PublishInput } from "../shared/types.ts";
import { Store } from "./store.ts";
import { Domain, DomainError } from "./domain.ts";
import { campaignCsv, settlementRecord } from "./export.ts";
import { startWorker,type WorkerHandle } from "./worker.ts";
import {serveBuiltApp} from './static.ts';
import {createNearReader,type NearReader} from './near.ts';

export interface ApplicationOptions {
  dbPath: string;
  clock?: () => number;
  workerIntervalMs?: number;
  worker?: boolean;
  staticDir?: string;
  integrationPath?: string;
  logger?: (entry: Record<string, unknown>) => void;
  nearReader?:NearReader;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
function header(req: IncomingMessage, name: string) {
  const value = req.headers[name.toLowerCase()];
  return typeof value === "string" ? value : "";
}
function validateRequestLocation(req: IncomingMessage) {
  let host: URL;
  try {
    host = new URL(`http://${header(req, "host")}`);
  } catch {
    throw new DomainError("WRONG_ACTOR", "Invalid local host.", 403);
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host.hostname))
    throw new DomainError(
      "WRONG_ACTOR",
      "This demo accepts loopback hosts only.",
      403,
    );
  if (req.method === "POST") {
    const origin = header(req, "origin");
    if (origin) {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new DomainError("WRONG_ACTOR", "Invalid origin.", 403);
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        !["5173", "8787", host.port].includes(url.port)
      )
        throw new DomainError(
          "WRONG_ACTOR",
          "Cross-origin monetary commands are rejected.",
          403,
        );
    }
  }
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(header(req, "content-type")))
    throw new DomainError("VALIDATION_ERROR", "Use application/json.", 400);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    length += chunk.length;
    if (length > 32768)
      throw new DomainError("VALIDATION_ERROR", "Request exceeds 32 KiB.", 413);
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new DomainError("VALIDATION_ERROR", "Provide a JSON object.", 400);
  }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

export function createApplication(options: ApplicationOptions) {
  if (process.env.ALLTOGETHER_MODE && process.env.ALLTOGETHER_MODE !== "local")
    throw new Error(
      "RPC_UNAVAILABLE: NEAR mode is not configured. The local ledger will not masquerade as blockchain state.",
    );
  const store = new Store(options.dbPath),
    domain = new Domain(store, {
      clock: options.clock,
      integrationPath: options.integrationPath,
    });
  domain.seedAccounts();
  const stopWorker:WorkerHandle =
    options.worker === false
      ? Object.assign(()=>{},{health:()=>({enabled:false,running:false,startedAt:Date.now().toString(),lastPollAt:null,lastSuccessfulPollAt:null,lastError:null,lastProcessedCount:0})})
      : startWorker(domain, options.workerIntervalMs);
  const staticDir = resolve(options.staticDir ?? "dist/web");
  const readNear=options.nearReader??createNearReader();
  const log = options.logger ?? ((entry: Record<string, unknown>) => console.log(JSON.stringify(entry)));
  const server = createServer(async (req, res) => {
    const started = Date.now();
    let nearRequest=false;
    try {
      validateRequestLocation(req);
      let rawPath:string;
      try{rawPath=decodeURIComponent((req.url??'/').split('?')[0]);}catch{throw new DomainError('VALIDATION_ERROR','Invalid path encoding.',400);}
      if(rawPath.includes('\0')||rawPath.includes('\\')||rawPath.split('/').some(part=>part==='.'||part==='..'))throw new DomainError('NOT_FOUND','Invalid file path.',404);
      const url = new URL(req.url ?? "/", "http://localhost");
      let path: string;
      try {
        path = decodeURIComponent(url.pathname);
      } catch {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Invalid path encoding.",
          400,
        );
      }
      const parts = path.split("/").filter(Boolean);
      nearRequest=path.startsWith('/api/near/');
      if(path==='/api/near/snapshot'&&req.method!=='GET')throw new DomainError('METHOD_NOT_ALLOWED','The live testnet snapshot is read-only.',405);
      if(path==='/api/near/snapshot'&&req.method==='GET'){
        const data=await readNear({accountId:url.searchParams.get('accountId')??undefined,campaignId:url.searchParams.get('campaignId')??undefined,fromIndex:url.searchParams.get('fromIndex')??undefined,limit:limit(url.searchParams.get('limit'),20)});json(res,200,data);return;
      }
      if (path.startsWith("/api")) {
        if (req.method === "GET") {
          let data: unknown;
          if (path === "/api/config") data = domain.config();
          else if (path === "/api/health") {
            store.db.prepare("SELECT 1").get();
            data = { storage: "ok", mode: "local", schemaVersion: 1,worker:options.worker===false?{enabled:false,running:false,lastPollAt:null,lastSuccessfulPollAt:null,lastError:null}:stopWorker.health(),pending:domain.pendingHealth() };
          } else if (path === "/api/campaigns")
            data = domain.listCampaigns({
              state: url.searchParams.get("state") || undefined,
              cursor: url.searchParams.get("cursor") || undefined,
              limit: limit(url.searchParams.get("limit"), 20),
            });
          else if (parts[1] === "accounts" && parts.length === 3)
            data = domain.account(parts[2]);
          else if (path === "/api/custody") data = domain.custody();
          else if (parts[1] === "campaigns" && parts.length === 3)
            data = domain.campaign(parts[2]);
          else if (
            parts[1] === "campaigns" &&
            parts[3] === "custody" &&
            parts.length === 4
          )
            data = domain.custody(parts[2]);
          else if (
            parts[1] === "campaigns" &&
            parts[3] === "activity" &&
            parts.length === 4
          )
            data = domain.activity(parts[2], {
              cursor: url.searchParams.get("cursor") || undefined,
              limit: limit(url.searchParams.get("limit"), 50),
            });
          else if (
            parts[1] === "campaigns" &&
            parts[3] === "export" &&
            parts.length === 4
          ) {
            const format = url.searchParams.get("format") ?? "json";
            if (format !== "json" && format !== "csv")
              throw new DomainError(
                "VALIDATION_ERROR",
                "Choose json or csv.",
                400,
              );
            const result =
              format === "csv"
                ? campaignCsv(domain, parts[2])
                : JSON.stringify(settlementRecord(domain, parts[2]), null, 2);
            res.writeHead(200, {
              "Content-Type":
                format === "csv"
                  ? "text/csv; charset=utf-8"
                  : "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="alltogether-plan-${parts[2].replace(/[^0-9]/g, "")}.${format}"`,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            res.end(result);
            return;
          } else
            throw new DomainError("NOT_FOUND", "API route not found.", 404);
          json(res, 200, { ok: true, data, source: domain.source() });
          return;
        }
        if (req.method !== "POST")
          throw new DomainError("NOT_FOUND", "API route not found.", 404);
        const actor = header(req, "x-demo-actor"),
          key = header(req, "idempotency-key");
        if (!/^[\x20-\x7e]{8,128}$/.test(key))
          throw new DomainError(
            "VALIDATION_ERROR",
            "Provide an 8–128 character Idempotency-Key.",
            400,
          );
        const input = await body(req),
          fingerprint = createHash("sha256")
            .update(`${req.method}\n${path}\n${canonical(input)}`)
            .digest("hex");
        let status = 200,
          operation: () => unknown;
        if (path === "/api/campaigns") {
          status = 201;
          operation = () =>
            domain.publish(actor, input as unknown as PublishInput);
        } else if (parts[1] === "campaigns" && parts.length === 4) {
          const id = parts[2];
          switch (parts[3]) {
            case "sponsor-proposal":
              operation = () => domain.createProposal(actor, id);
              break;
            case "pledges":
              operation = () =>
                domain.pledge(
                  actor,
                  id,
                  input.legId,
                  input.amount,
                  input.termsHash,
                );
              break;
            case "withdrawals":
              operation = () =>
                domain.withdraw(actor, id, input.legId, input.amount);
              break;
            case "finalize":
              operation = () => domain.finalize(actor, id);
              break;
            case "refunds":
              operation = () => domain.materializeRefund(actor, id);
              break;
            default:
              throw new DomainError("NOT_FOUND", "API route not found.", 404);
          }
        } else if (
          parts[1] === "credits" &&
          parts[3] === "claims" &&
          parts.length === 4
        ) {
          status = 202;
          operation = () => domain.claim(actor, parts[2]);
        } else if (
          parts[1] === "demo" &&
          parts[2] === "proposals" &&
          parts[4] === "decision" &&
          parts.length === 5
        )
          operation = () =>
            domain.decideProposal(actor, parts[3], input.decision);
        else if (
          parts[1] === "demo" &&
          parts[2] === "campaigns" &&
          parts[4] === "fund" &&
          parts.length === 5
        )
          operation = () =>
            domain.fundSponsor(actor, parts[3], input.amount, input.termsHash);
        else if (path === "/api/demo/register-token")
          operation = () => domain.registerToken(actor, input.accountId);
        else if (path === "/api/demo/seed")
          operation = () => {
            if (input.scenario === "accounts")
              return { campaignIds: [], seeded: false };
            if (input.scenario !== "walkthrough")
              throw new DomainError(
                "VALIDATION_ERROR",
                "Choose accounts or walkthrough.",
                400,
              );
            return domain.seedWalkthrough(actor);
          };
        else throw new DomainError("NOT_FOUND", "API route not found.", 404);
        const result = domain.command(
          actor,
          key,
          fingerprint,
          operation,
          status,
        );
        log({event: "local_command", mode: "local", actor, method: req.method, path, status: result.status, durationMs: Date.now() - started, durable: true});
        json(res, result.status, result.body);
        return;
      }
      serveBuiltApp(req,res,staticDir,path);
    } catch (error) {
      const known = error instanceof DomainError;
      if (!known)
        console.error(
          JSON.stringify({
            event: "request_error",
            message: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      json(res, known ? error.status : 500, {
        ok: false,
        error: {
          code: known ? error.code : "INTERNAL_ERROR",
          message: known
            ? error.message
            : "The local transaction failed safely. Please retry.",
          retryable: !known,
          ...(known && error.details ? { details: error.details } : {}),
        },
        source: nearRequest?{mode:'near',network:'testnet',observedAt:Date.now().toString(),stale:true}:domain.source(),
      });
    }
  });
  server.headersTimeout=15_000;server.requestTimeout=30_000;
  function close(): Promise<void> {
    stopWorker();
    return new Promise((resolveClose, reject) => {
      if (!server.listening) {
        store.close();
        resolveClose();
        return;
      }
      server.close((error) => {
        store.close();
        if (error) reject(error);
        else resolveClose();
      });
    });
  }
  return { server, domain, store, close };
}
function limit(value: string | null, max: number): number {
  if (value === null) return max;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max)
    throw new DomainError("VALIDATION_ERROR", `Limit must be 1–${max}.`, 400);
  return Number(value);
}
