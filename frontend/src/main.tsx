import "@mantine/core/styles.css";
import { bootstrap } from "./app/bootstrap";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Missing #root element in index.html");
}

bootstrap(import.meta.env, container);
