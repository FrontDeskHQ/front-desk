import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_public/legal/privacy-policy")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-4 py-12 border-x">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
        <p>Last updated: 2025-10-24</p>
        <p>
          FrontDesk (“we”, “our”, “us”) respects your privacy and is committed
          to protecting your personal information. This Privacy Policy explains
          how we collect, use, and share information when you use our website,
          applications, and services (collectively, the “Service”).
        </p>
        <p>
          By using the Service, you agree to this Privacy Policy. If you do not
          agree, please do not use the Service.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          1. Information We Collect
        </h2>
        <p>We collect information in the following ways:</p>
        <h3 className="text-lg font-bold mb-2 mt-4">
          a. Information You Provide
        </h3>
        <p>When you create an account or use our Service, we may collect:</p>
        <ul className="list-disc list-inside">
          <li>Name, email address, and contact information.</li>
          <li>Company or organization details.</li>
          <li>
            Billing and payment information (handled by secure third-party
            processors).
          </li>
          <li>
            Any messages, files, or other data you submit through the Service.
          </li>
        </ul>
        <h3 className="text-lg font-bold mb-2 mt-4">
          b. Information We Collect Automatically
        </h3>
        <p>When you use the Service, we may automatically collect:</p>
        <ul className="list-disc list-inside">
          <li>
            Log data (IP address, browser type, operating system, access times).
          </li>
          <li>Usage data (pages visited, features used, actions taken).</li>
          <li>Device information and approximate location.</li>
        </ul>
        <h3 className="text-lg font-bold mb-2 mt-4">
          c. Information from Third Parties
        </h3>
        <p>
          We may receive information from third-party services you connect to
          our platform (for example, integrations, authentication providers, or
          analytics tools).
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          2. How We Use Your Information
        </h2>
        <p>We use your information to:</p>
        <ul className="list-disc list-inside">
          <li>Provide, operate, and improve the Service.</li>
          <li>Process transactions and manage subscriptions.</li>
          <li>Communicate with you (support, updates, billing notices).</li>
          <li>Personalize your experience.</li>
          <li>Monitor and analyze usage for performance and security.</li>
          <li>Comply with legal obligations and enforce our Terms.</li>
        </ul>
        <h2 className="text-xl font-bold mb-2 mt-4">
          3. How We Share Information
        </h2>
        <p>We do not sell your personal information.</p>{" "}
        <p>We may share information with:</p>{" "}
        <ul className="list-disc list-inside">
          <li>
            Service providers who perform functions on our behalf (e.g.,
            hosting, analytics, payment processing).
          </li>
          <li>
            Legal authorities, when required by law or to protect our rights.
          </li>
          <li>
            Business transfers, if we are involved in a merger, acquisition, or
            sale of assets.
          </li>
        </ul>
        <p>
          All third parties are required to handle your data securely and in
          compliance with applicable privacy laws.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">4. Data Retention</h2>
        <p>
          We retain your information as long as your account is active or as
          needed to provide the Service, comply with our legal obligations,
          resolve disputes, or enforce agreements. You may request deletion of
          your data at any time (see Section 8 below).
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">5. Security</h2>
        <p>
          We use reasonable administrative, technical, and physical safeguards
          to protect your information against unauthorized access, loss, or
          misuse. However, no system is 100% secure, and we cannot guarantee
          absolute security.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          6. Cookies and Tracking Technologies
        </h2>
        <p>We use cookies and similar technologies to:</p>
        <ul className="list-disc list-inside">
          <li>Remember your preferences and settings</li>
          <li>Analyze usage and improve performance</li>
          <li>Provide relevant content and features</li>
        </ul>
        <p>
          You can control cookies through your browser settings, but disabling
          them may affect your experience.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          7. International Data Transfers
        </h2>
        <p>
          If you access the Service from outside Brazil, please note that your
          data may be transferred to and processed in other countries where data
          protection laws may differ. We take steps to ensure adequate
          protection in accordance with applicable laws.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">8. Your Rights</h2>
        <p>Depending on your location, you may have the right to: </p>
        <ul className="list-disc list-inside">
          <li>Access, update, or delete your personal data</li>
          <li>Withdraw consent at any time</li>
          <li>Object to or restrict certain processing</li>
          <li>Request data portability</li>
        </ul>
        <p>
          To exercise these rights, contact us at{" "}
          <a href="mailto:hello@tryfrontdesk.app" className="underline">
            hello@tryfrontdesk.app
          </a>
          . We may need to verify your identity before processing your request.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">9. Children's Privacy</h2>
        <p>
          Our Service is not directed to children under 16, and we do not
          knowingly collect personal data from them. If we become aware that we
          have collected information from a minor without consent, we will
          delete it promptly.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          10. Changes to This Policy
        </h2>
        <p>
          We may update this Privacy Policy from time to time. When we do, we
          will update the “Last updated” date at the top of this page. Your
          continued use of the Service after any changes indicates acceptance of
          the revised policy.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">11. Contact Us</h2>
        <p>
          If you have any questions or concerns about this Privacy Policy,
          please contact us at:
          <br />
          Email: hello@tryfrontdesk.app
          <br />
          Address: Salvador, Brazil
        </p>
      </div>
    </div>
  );
}
