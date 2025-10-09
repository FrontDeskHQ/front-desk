import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  pixelBasedPreset,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface InviteUserProps {
  invitedByName?: string;
  organizationName?: string;
  organizationImage?: string;
  inviteLink?: string;
}

export const InviteUserEmail = ({
  invitedByName,
  organizationName,
  organizationImage,
  inviteLink,
}: InviteUserProps) => {
  return (
    <Html>
      <Head />
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
        }}
      >
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Preview>{`Join ${organizationName} on FrontDesk`}</Preview>
          <Section className="mt-[32px] mx-auto w-auto">
            <Row>
              <Column>
                <Img
                  className="rounded-full"
                  src="https://public-files.tryfrontdesk.app/branding/front-desk-logo-black.png"
                  width="36"
                  height="36"
                  alt={`FrontDesk logo`}
                />
              </Column>
              <Column>
                <Text className="text-[18px] text-black leading-[24px]">
                  FrontDesk
                </Text>
              </Column>
            </Row>
          </Section>
          <Container className="mx-auto my-5 max-w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Section className="mt-[32px]">
              {organizationImage ? (
                <Img
                  src={organizationImage}
                  width="50"
                  height="50"
                  alt={`${organizationName} Logo`}
                  className="mx-auto my-0 rounded-md"
                />
              ) : (
                <Text className="w-12 rounded-md bg-indigo-400 mx-auto text-center text-[22px] font-medium leading-[50px]">
                  {organizationName?.charAt(0)?.toUpperCase() || "O"}
                </Text>
              )}
            </Section>
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              Join <strong>{organizationName}</strong> on{" "}
              <strong>FrontDesk</strong>
            </Heading>
            <Text className="text-[14px] text-center text-black leading-[24px]">
              <strong>{invitedByName}</strong> has invited you to the{" "}
              <strong>{organizationName}</strong> team on{" "}
              <strong>FrontDesk</strong>.
            </Text>
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded bg-[#345BCA] px-5 py-3 text-center font-semibold text-[12px] text-white no-underline"
                href={inviteLink}
              >
                Join the team
              </Button>
            </Section>
            {/* <Text className="text-[14px] text-black leading-[24px]">
              Or copy and paste this URL into your browser:{" "}
              <Link href={inviteLink} className="text-blue-600 no-underline">
                {inviteLink}
              </Link>
            </Text> */}
            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px] text-center">
              If you were not expecting this invitation, you can ignore this
              email.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

InviteUserEmail.PreviewProps = {
  invitedByName: "Alan",
  // organizationImage: `${baseUrl}/static/vercel-user.png`,
  organizationName: "Enigma",
  inviteLink:
    "https://tryfrontdesk.app/app/invitation/01k75jwfswsb2y19pkf2kxafnx",
} satisfies InviteUserProps;

export default InviteUserEmail;
