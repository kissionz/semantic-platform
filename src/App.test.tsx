import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "./App";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ontology workspace", () => {
  it("keeps tooltip portals separate from the page layout", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.focus(screen.getByRole("button", { name: "切换主题" }));
    act(() => vi.advanceTimersByTime(500));
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip.closest(".app-root")).toBeNull();
    expect(document.querySelectorAll(".app-root")).toHaveLength(1);
  });

  it("keeps dialog portals themed without inheriting the page layout", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "切换主题" }));
    fireEvent.click(screen.getByRole("button", { name: "新建对象" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.closest(".app-root")).toBeNull();
    expect(dialog.closest(".app-theme")).toHaveClass("dark");
  });

  it("keeps a single desktop navigation accessible when collapsed", () => {
    render(<App />);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    const navigation = screen.getByRole("navigation", { name: "主要导航" });
    fireEvent.click(within(navigation).getByRole("button", { name: "语义测试" }));
    expect(screen.getByRole("heading", { name: "语义测试" })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "语义测试" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the ontology directly and filters its catalog", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "业务本体" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "主要导航" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(4);
    const search = screen.getByRole("textbox", { name: "搜索本体目录" });
    fireEvent.change(search, { target: { value: "客户" } });
    expect(screen.getByRole("button", { name: "客户 2 个属性" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "销售事件 7 个属性" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "does-not-exist" } });
    expect(screen.getByText("未找到结果")).toBeInTheDocument();
  });

  it("resets catalog search between tabs and shows the scaled ratio", () => {
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索本体目录" }), { target: { value: "客户" } });
    fireEvent.click(screen.getByRole("tab", { name: "指标" }));
    expect(screen.getByRole("textbox", { name: "搜索本体目录" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "毛利率 派生指标" }));
    expect(screen.getByText("(毛利额 / 销售额) × 100")).toBeInTheDocument();
  });

  it("validates and publishes the current draft", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "校验草稿" }));
    expect(screen.getByText("校验通过")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "发布版本" }));
    expect(screen.getByText("已发布")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布版本" })).toBeDisabled();
  });

  it("invalidates old checks after adding an object and exposes validation errors", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "校验草稿" }));
    fireEvent.click(screen.getByRole("button", { name: "新建对象" }));
    fireEvent.change(screen.getByRole("textbox", { name: /业务名称/ }), { target: { value: "商品" } });
    fireEvent.change(screen.getByRole("textbox", { name: /来源表/ }), { target: { value: "dim_product" } });
    fireEvent.click(screen.getByRole("button", { name: "创建对象" }));
    expect(screen.queryByText("校验通过")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "商品" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "校验草稿" }));
    expect(screen.getByText("需要修正")).toBeInTheDocument();
    expect(screen.getByText("ENTITY 必须且只能包含一个 ID 属性")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布版本" })).toBeDisabled();
  });
});
