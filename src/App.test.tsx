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
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
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
    const dialog=screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("创建对象关系");
    expect(within(dialog).getByLabelText(/关系类型/)).toHaveDisplayValue("引用关系");
    expect(within(dialog).getAllByRole("option").filter(option=>["引用关系","主子关系","业务关联","父子层级","事件参与","同一身份","派生关系"].includes(option.textContent||""))).toHaveLength(7);
    expect(within(dialog).queryByLabelText("基数")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("N:1");
    fireEvent.change(within(dialog).getByLabelText(/关系名称/),{target:{value:"销售归属客户复核"}});
    fireEvent.click(within(dialog).getByRole("button",{name:"创建关系"}));
    fireEvent.click(screen.getByRole("tab",{name:"关系"}));
    expect(screen.getByRole("button",{name:"销售归属客户复核 引用关系"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"保存草稿"})).toBeInTheDocument();
  });

  it("edits governed property metadata from the object inspector", async () => {
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"本体"}));
    fireEvent.click(screen.getByRole("button",{name:"客户 2 个属性"}));
    fireEvent.click(screen.getByRole("button",{name:"编辑客户名称"}));
    const dialog=screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("customer_name");
    expect(within(dialog).getByRole("checkbox",{name:"支持值检索"})).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText(/业务名称/),{target:{value:"客户全称"}});
    fireEvent.click(within(dialog).getByRole("button",{name:"保存属性"}));
    expect(screen.getByText("客户全称")).toBeInTheDocument();
  });

  it("requires units and currency metadata for monetary properties", async () => {
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"本体"}));
    fireEvent.click(screen.getByRole("button",{name:"编辑销售金额"}));
    const dialog=screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/业务单位/)).toHaveValue("元");
    expect(within(dialog).getByLabelText(/币种/)).toHaveValue("CNY");
    expect(within(dialog).getByRole("checkbox",{name:"支持值检索"})).toBeDisabled();
  });

  it("fills legacy numeric requirements and keeps each numeric form balanced", async () => {
    const legacySnapshot=structuredClone(sampleSnapshot);
    const amount=legacySnapshot.objects[0].properties.find((property)=>property.label==="销售金额")!;
    amount.numericSpec={kind:"CURRENCY",defaultAggregation:"SUM",aggregationBehavior:"ADDITIVE"};
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if(String(input).endsWith("/api/bootstrap"))return new Response(JSON.stringify({...bootstrap,draft:legacySnapshot}),{status:200,headers:{"Content-Type":"application/json"}});
      return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});
    });
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"本体"}));
    fireEvent.click(screen.getByRole("button",{name:"编辑销售金额"}));
    const dialog=screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/业务单位/)).toHaveValue("元");
    expect(within(dialog).getByLabelText(/币种/)).toHaveValue("CNY");
    expect(dialog.querySelector(".numeric-rules")).toHaveClass("currency");
    expect(within(dialog).getByRole("button",{name:"保存属性"})).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText(/数值类型/),{target:{value:"GENERAL"}});
    expect(within(dialog).getByLabelText(/业务单位/)).toHaveValue("个");
    expect(dialog.querySelector(".numeric-rules")).toHaveClass("general");
  });

  it("creates ontology objects from multiple physical tables in one request", async () => {
    const tables = [
      {id:"table-orders",sourceId:"source-1",project:"retail",name:"fact_orders",type:"TABLE",columns:[{name:"order_id",dataType:"BIGINT",nullable:false,partition:false}],fingerprint:"a",addedAt:new Date().toISOString()},
      {id:"table-products",sourceId:"source-1",project:"retail",name:"dim_product",type:"TABLE",columns:[{name:"product_id",dataType:"BIGINT",nullable:false,partition:false}],fingerprint:"b",addedAt:new Date().toISOString()},
    ];
    const nextBootstrap={...bootstrap,tables};
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url=String(input);
      if(url.endsWith("/api/bootstrap"))return new Response(JSON.stringify(nextBootstrap),{status:200,headers:{"Content-Type":"application/json"}});
      if(url.endsWith("/api/ontology/from-table"))return new Response(JSON.stringify({draft:sampleSnapshot,validation:[]}),{status:200,headers:{"Content-Type":"application/json"}});
      return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});
    });
    render(<App/>);
    const navigation=await screen.findByRole("navigation",{name:"主要导航"});
    fireEvent.click(within(navigation).getByRole("button",{name:"本体"}));
    fireEvent.click(screen.getByRole("button",{name:"从物理表建模"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"选择 fact_orders"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"选择 dim_product"}));
    fireEvent.click(screen.getByRole("button",{name:"创建 2 个对象"}));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([input])=>String(input).endsWith("/api/ontology/from-table"))).toBe(true));
    const call=vi.mocked(fetch).mock.calls.find(([input])=>String(input).endsWith("/api/ontology/from-table"))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({tables:[{tableId:"table-orders"},{tableId:"table-products"}]});
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
