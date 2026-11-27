import { Anchor, PageLayout, Text } from "../../../shared/ui";
import { Link } from "react-router";

export function NotAllowedPage() {
  return (
    <main>
      <PageLayout title="Not allowed" size="sm">
        <Text>Your account does not have access to this page.</Text>
        <Anchor component={Link} to="/" display="block">
          Back to home
        </Anchor>
      </PageLayout>
    </main>
  );
}
