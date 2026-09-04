import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { sampleSnapshot } from "./domain/sample";

const bootstrap = {
  principal: { id: "user-1", username: "admin", displayName: "平台管理员", role: "ADMIN" },
  source: null,
  tables: [],
  draft: sampleSnapshot,
  published: null,
  audits: [],
  users: [{ id: "user-1", username: "admin", displayName: "平台管理员", role: "ADMIN" }],
};

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
});
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url=String(input);
    if(url.endsWith("/api/bootstrap"))return new Response(JSON.stringify(bootstrap),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.endsWith("/api/catalog/find"))return new Response(JSON.stringify({found:true,table:{project:"retail",name:"fact_sales",type:"TABLE",columns:[{name:"sale_id",dataType:"BIGINT",nullable:false,partition:false}]}}),{status:200,headers:{"Content-Type":"application/json"}});
    return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("independent platform shell", () => {
  it("loads the complete desktop navigation", async () => {
    render(<App/>);
    expect(await screen.findByRole("heading",{name:"平台总览"})).toBeInTheDocument();
    const navigation=screen.getByRole("navigation",{name:"主要导航"});
    expect(within(navigation).getByRole("button",{name:"总览"})).toBeInTheDocument();
    expect(within(navigation).getByRole("button",{name:"本体"})).toBeInTheDocument();
    expect(within(navigation).getByRole("button",{name:"系统管理"})).toHaveAttribute("aria-expanded","true");
    expect(within(navigation).getAllByRole("button")).toHaveLength(8);
    expect(screen.queryByText("命名空间")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"收起侧边栏"}));
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });

  it("shows live ontology content in the dashboard graph", async () => {
    render(<App/>);
    expect(await screen.findByRole("img",{name:"本体对象关系图"})).toBeInTheDocument();
    expect(screen.getByText("草稿指标").nextElementSibling).toHaveTextContent("4");
    fireEvent.click(screen.getByRole("button",{name:"查看客户"}));
    expect(screen.getByText("客户 ID")).toBeInTheDocument();
    expect(screen.getByText("客户名称")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab",{name:/指标清单/}));
    expect(screen.getByRole("button",{name:/^销售额 /})).toBeInTheDocument();
  });

  it("keeps transient UI separate from the page layout", async () => {
    render(<App/>);
    const button=await screen.findByRole("button",{name:"切换主题"});
    vi.useFakeTimers(); fireEvent.focus(button); act(()=>vi.advanceTimersByTime(500));
    expect(document.querySelectorAll(".app-root")).toHaveLength(1);
  });

  it("requires a configured source for exact table lookup", async () => {
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"数据目录"}));
    const input=await screen.findByPlaceholderText("输入准确的 MaxCompute 表名");
    fireEvent.change(input,{target:{value:"fact_sales"}});
    expect(screen.getByRole("button",{name:"查找表"})).toBeDisabled();
    expect(screen.getByText("输入准确表名开始添加")).toBeInTheDocument();
  });

  it("opens the persisted ontology workspace and filters its catalog", async () => {
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"本体"}));
    expect(screen.getByRole("heading",{name:"业务本体"})).toBeInTheDocument();
    const search=screen.getByRole("textbox",{name:"搜索本体目录"}); fireEvent.change(search,{target:{value:"客户"}});
    expect(screen.getByRole("button",{name:"客户 2 个属性"})).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"销售事件 7 个属性"})).not.toBeInTheDocument();
  });

  it("exposes governed metric and relation creation", async () => {
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"本体"}));
    fireEvent.click(screen.getByRole("button",{name:"新建指标"}));
    expect(screen.getByRole("dialog")).toHaveTextContent("创建基础指标");
    fireEvent.click(screen.getByRole("button",{name:"取消"}));
    fireEvent.click(screen.getByRole("button",{name:"新建关系"}));
    expect(screen.getByRole("dialog")).toHaveTextContent("创建对象关系");
    expect(screen.getByRole("button",{name:"保存草稿"})).toBeInTheDocument();
  });

  it("renders login when the session is absent", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({message:"请先登录"}),{status:401,headers:{"Content-Type":"application/json"}}));
    render(<App/>);
    expect(await screen.findByRole("heading",{name:"登录语义平台"})).toBeInTheDocument();
    expect(screen.getByLabelText("账号")).toHaveValue("admin");
    expect(screen.getByRole("button",{name:"登录"})).toBeDisabled();
  });

  it("keeps dialogs themed without inheriting page layout", async () => {
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"用户管理"})); fireEvent.click(screen.getByRole("button",{name:"切换主题"})); fireEvent.click(screen.getByRole("button",{name:"添加用户"}));
    await waitFor(()=>expect(screen.getByRole("dialog").closest(".app-root")).toBeNull());
    expect(screen.getByRole("dialog").closest(".app-theme")).toHaveClass("dark");
  });
});
