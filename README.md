# 语义平台

独立部署的 MaxCompute 语义建模与受控查询平台。当前 MVP 提供登录与角色、数据源配置、精确表检索、本体草稿与发布、查询执行和审计记录。

## 本地运行

需要 Node.js 24+ 与 Python 3.10+。

```bash
npm install
python3 -m pip install -r requirements.txt
npm start
```

打开 <http://localhost:5173>。首次启动会在 API 日志中输出一次性 `admin` 初始密码，运行数据保存在 `.semantic-platform/`。

## MaxCompute 接入

1. 在「数据目录」填写 Endpoint、Project 和最小权限服务账号凭据。
2. 测试连接并保存，AccessKey Secret 使用 AES-256-GCM 加密后持久化。
3. 输入准确表名进行检索，确认字段后添加到物理目录。
4. 在「本体」中选择已添加的表，配置对象类型、ID 字段和时间字段。
5. 补充指标与关系，校验后发布，再到「查询工作台」执行查询。

平台只向 MaxCompute 提交由已发布本体编译的 `SELECT` 查询，业务参数通过 PyODPS 参数接口传递。推荐为平台创建专用只读服务账号，并限制 Project、表和列权限。

## 生产部署

复制 `.env.example` 为 `.env`，生成独立密钥：

```bash
openssl rand -base64 32
```

分别设置 `SEMANTIC_ADMIN_PASSWORD` 与 `SEMANTIC_CREDENTIAL_KEY`，然后启动：

```bash
docker compose up -d --build
```

服务地址为 <http://localhost:8080>，SQLite、审计日志和加密凭据保存在 Docker 数据卷中。请在反向代理层启用 HTTPS。

## 验证

```bash
npm run build
npm test -- --run
```

真实 MaxCompute 连接测试需要可访问目标 Project 的凭据和网络环境。
