import { Button, Card, Modal, Table, Tabs, TextInput } from "@mantine/core";

/** Component defaults, so features set no per-usage styling for these primitives. */
export const componentDefaults = {
  Button: Button.extend({ defaultProps: { radius: "md", fw: 600 } }),
  Card: Card.extend({ defaultProps: { withBorder: true, padding: "md", radius: "md" } }),
  Table: Table.extend({ defaultProps: { verticalSpacing: "sm", horizontalSpacing: "md", withRowBorders: true } }),
  TextInput: TextInput.extend({ defaultProps: { radius: "md" } }),
  Modal: Modal.extend({ defaultProps: { centered: true, radius: "md", overlayProps: { backgroundOpacity: 0.55, blur: 2 } } }),
  Tabs: Tabs.extend({ defaultProps: { keepMounted: false } }),
};
