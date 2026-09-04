#!/usr/bin/env python3
"""Small JSON-line bridge to the official PyODPS SDK."""
import json
import os
import sys
import time
from datetime import date, datetime
from decimal import Decimal


def emit(value):
    print(json.dumps(value, ensure_ascii=False, default=serialize))


def serialize(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def client(payload):
    try:
        from odps import ODPS
        from odps.accounts import StsAccount
    except ImportError as exc:
        raise RuntimeError("缺少 PyODPS，请运行 python3 -m pip install -r requirements.txt") from exc
    source = payload["source"]
    secret = payload["secret"]
    account = None
    if secret.get("stsToken"):
        account = StsAccount(secret["accessId"], secret["accessKey"], secret["stsToken"])
    options = {
        "project": source["project"],
        "endpoint": source["endpoint"],
        "schema": source.get("schema") or None,
    }
    if account:
        return ODPS(account=account, **options)
    return ODPS(secret["accessId"], secret["accessKey"], **options)


def table_payload(table, source):
    table.reload()
    partition_names = {column.name for column in table.schema.partitions}
    columns = []
    for column in list(table.schema.simple_columns) + list(table.schema.partitions):
        columns.append({
            "name": column.name,
            "dataType": str(column.type).upper(),
            "nullable": bool(getattr(column, "nullable", True)),
            "comment": getattr(column, "comment", None),
            "partition": column.name in partition_names,
        })
    return {
        "project": source["project"],
        "schema": source.get("schema"),
        "name": table.name,
        "type": "VIEW" if "VIEW" in str(getattr(table, "type", "TABLE")).upper() else "TABLE",
        "comment": getattr(table, "comment", None),
        "columns": columns,
    }


def main():
    payload = json.load(sys.stdin)
    odps = client(payload)
    action = payload["action"]
    if action == "test":
        project = odps.get_project(payload["source"]["project"])
        project.reload()
        emit({"ok": True, "project": project.name, "owner": getattr(project, "owner", None)})
        return
    if action == "find_table":
        name = payload["tableName"].strip()
        if not name or not odps.exist_table(name):
            emit({"found": False})
            return
        emit({"found": True, "table": table_payload(odps.get_table(name), payload["source"])})
        return
    if action == "query":
        started = time.monotonic()
        instance = odps.execute_sql(
            payload["sql"],
            parameters=payload.get("parameters") or {},
            quota_name=payload["source"].get("quota") or None,
        )
        max_rows = min(int(payload.get("maxRows", 1000)), 10000)
        rows = []
        with instance.open_reader(tunnel=True, limit=max_rows) as reader:
            names = [column.name for column in reader._schema.columns]
            for record in reader:
                rows.append(dict(zip(names, record.values)))
                if len(rows) >= max_rows:
                    break
        emit({"instanceId": instance.id, "columns": names, "rows": rows, "truncated": len(rows) >= max_rows, "durationMs": round((time.monotonic() - started) * 1000)})
        return
    raise RuntimeError("未知 MaxCompute 操作")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"error": str(error), "errorType": type(error).__name__})
        sys.exit(1)
