import type { ApiClient } from "../../../shared/lib/api-client";

export class AdminApi {
  constructor(private readonly client: ApiClient) {}

  ping(): Promise<{ ok: boolean }> {
    return this.client.get("/admin/ping");
  }
}
