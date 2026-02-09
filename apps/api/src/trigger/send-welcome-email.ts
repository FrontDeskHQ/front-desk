import { task } from "@trigger.dev/sdk/v3";
import { Resend } from "resend";

export const sendWelcomeEmail = task({
  id: "send-welcome-email",
  run: async (payload: { email: string; name: string | null }) => {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const firstName = payload.name?.split(" ")[0];
    const greeting = firstName ? `Hey ${firstName}` : "Hey";

    await resend.emails.send({
      from: "Pedro Costa <pedro@tryfrontdesk.app>",
      replyTo: "pedro@tryfrontdesk.app",
      to: [payload.email],
      subject: "Welcome to FrontDesk",
      text: `${greeting},

I'm Pedro, the founder of FrontDesk. Just wanted to reach out and say welcome!

If you have any questions, feedback, or just want to chat just reply to this email, i'll read every single one.

Thanks for giving FrontDesk a try, I hope it helps you out.

Best,
Pedro`,
    });
  },
});
