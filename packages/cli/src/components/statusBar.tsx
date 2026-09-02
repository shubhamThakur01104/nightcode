import { TextAttributes } from "@opentui/core";

const StatusBar = () => {
  return (
    <box flexDirection="row" gap={1}>
      <text fg="cyan">Build</text>
      <text attributes={TextAttributes.DIM} fg="gray">
        &#8250;
      </text>
      <text>opus-4-6</text>
    </box>
  );
};

export default StatusBar;
