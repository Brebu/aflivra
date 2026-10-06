import {withLiveContext} from "../lib/live/request-context";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import {groupForCron, runGroup} from "../lib/live/refresh-sweep";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return withLiveContext(ctx, () => runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)));
  },
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    return withLiveContext(ctx, async () => {
      const group = groupForCron(controller.cron);
      if (!group) {
        console.warn(JSON.stringify({ event: "sweep_unknown_cron", cron: controller.cron }));
        return;
      }
      const result = await runGroup(group.name, env.DB);
      if (result) {
        console.log(JSON.stringify({ event: "sweep_completed", group: result.group, ok: result.ok, failed: result.failed, durationMs: Date.parse(result.finishedAt) - Date.parse(result.startedAt) }));
      }
    });
  },
};
