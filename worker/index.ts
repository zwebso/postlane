import { app } from "./app";
import { applyEmailSendingEvent } from "./email-events";
import { handleInboundEmail, type InboundEmail } from "./inbound";
import { redirectApexToWww } from "./redirect";
import { ensureSchema } from "./schema";

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const redirect = redirectApexToWww(request);
    if (redirect) return redirect;
    return app.fetch(request, env, ctx);
  },
  async email(message: InboundEmail, env: Env) {
    await handleInboundEmail(message, env);
  },
  async queue(batch: MessageBatch, env: Env) {
    await ensureSchema(env.DB);
    for (const message of batch.messages) {
      try {
        await applyEmailSendingEvent(env.DB, message.body, env);
        message.ack();
      } catch (error) {
        console.error("email delivery event failed", error);
        message.retry();
      }
    }
  },
};
