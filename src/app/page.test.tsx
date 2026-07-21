import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("サービスの目的と無償譲渡の原則を表示する", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "藍の夕凪" })).toBeInTheDocument();
    expect(screen.getByText("無償譲渡に限定")).toBeInTheDocument();
    expect(screen.getByText(/全国公開ではなく/)).toBeInTheDocument();
  });
});
