import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_public/legal/terms-of-service")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-4 py-12 border-x">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold mb-4">Terms of Service</h1>
        <p>Last updated: 2025-10-24</p>
        <p>
          Welcome to FrontDesk (“we”, “our”, “us”). These Terms of Service
          (“Terms”) govern your use of our website, applications, and services
          (collectively, the “Service”). By accessing or using the Service, you
          agree to be bound by these Terms. If you do not agree, do not use the
          Service.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">1. Use of the Service</h2>
        <p>
          You may use the Service only in compliance with these Terms and all
          applicable laws. You must be at least 18 years old (or the legal age
          of majority in your jurisdiction) to use the Service. You are
          responsible for maintaining the security of your account credentials
          and for all activity under your account. If you suspect unauthorized
          access, you must notify us immediately.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">2. Accounts</h2>
        <p>
          When you create an account, you agree to provide accurate and complete
          information. We may suspend or terminate your account if we suspect
          false information, abuse, or violation of these Terms.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          3. Subscription and Payments
        </h2>
        <p>
          Access to certain features of the Service may require a paid
          subscription. By subscribing, you agree to pay all applicable fees in
          accordance with the pricing and payment terms presented to you. All
          payments are non-refundable except as required by law or as otherwise
          stated in our refund policy. We may change prices at any time, with
          prior notice to you.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">4. Acceptable Use</h2>
        <p>
          You agree not to: Use the Service for any unlawful or harmful purpose;
          Interfere with or disrupt the integrity or performance of the Service;
          Attempt to gain unauthorized access to the Service or related systems;
          Reverse engineer, copy, or distribute any part of the Service without
          permission. We reserve the right to investigate and take appropriate
          action against violations, including account termination.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          5. Intellectual Property
        </h2>
        <p>
          All content, software, and materials provided through the Service are
          the property of FrontDesk or its licensors. You are granted a limited,
          non-exclusive, non-transferable license to access and use the Service
          for your internal business or personal purposes. You may not modify,
          reproduce, or distribute any part of the Service without prior written
          consent.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">6. Privacy</h2>
        <p>
          Your privacy is important to us. Our Privacy Policy explains how we
          collect, use, and share your information. By using the Service, you
          agree to the terms of our Privacy Policy.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">7. Termination</h2>
        <p>
          We may suspend or terminate your account or access to the Service at
          any time, with or without cause, and without liability. Upon
          termination, your right to use the Service will immediately cease. You
          may cancel your account at any time by contacting us or through your
          account settings.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">8. Disclaimers</h2>
        <p>
          The Service is provided “as is” and “as available.” We make no
          warranties, express or implied, including but not limited to
          warranties of merchantability, fitness for a particular purpose, or
          non-infringement. We do not guarantee that the Service will be
          uninterrupted or error-free.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          9. Limitation of Liability
        </h2>
        <p>
          To the maximum extent permitted by law, FrontDesk shall not be liable
          for any indirect, incidental, special, consequential, or punitive
          damages, including loss of profits, data, or goodwill, resulting from
          your use or inability to use the Service. Our total liability for any
          claim related to the Service shall not exceed the amount you paid to
          us in the 12 months prior to the claim.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">
          10. Changes to These Terms
        </h2>
        <p>
          We may update these Terms from time to time. When we do, we will
          revise the “Last updated” date above. Continued use of the Service
          after any changes means you accept the new Terms.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">11. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the
          laws of Brazil, without regard to conflict of law principles. Any
          disputes will be resolved exclusively in the courts of Salvador,
          Brazil.
        </p>
        <h2 className="text-xl font-bold mb-2 mt-4">12. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at:
          <br />
          Email:{" "}
          <a href="mailto:hello@tryfrontdesk.app" className="underline">
            hello@tryfrontdesk.app
          </a>
          <br />
          Address: Salvador, Brazil
        </p>
      </div>
    </div>
  );
}
