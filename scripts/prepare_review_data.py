"""Prepare static review data for the GitHub Pages app.

Run this from the standalone repo root:
    python scripts/prepare_review_data.py --source-root D:/learn/exp/autochemex
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = PROJECT_ROOT.parent / "autochemex"
DEFAULT_OUTPUT = PROJECT_ROOT / "public" / "data"


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy review packets into the static site public data folder.")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--packet-dir", type=Path)
    parser.add_argument("--registry", type=Path)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    packet_dir = (args.packet_dir or source_root / "src" / "data" / "dataset" / "review_packet").resolve()
    registry_path = (args.registry or source_root / "src" / "data" / "generated" / "parsed_parameter_registry.json").resolve()
    mineru_dir = (source_root / "src" / "data" / "generated" / "MinerU").resolve()
    output = args.out.resolve()
    packet_output = output / "review_packets"
    paper_output = output / "papers"

    if not packet_dir.is_dir():
        raise FileNotFoundError(f"Review packet directory not found: {packet_dir}")
    if not registry_path.is_file():
        raise FileNotFoundError(f"Parameter registry not found: {registry_path}")

    reset_dir(packet_output)
    reset_dir(paper_output)
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(registry_path, output / "parsed_parameter_registry.json")

    records: list[dict[str, Any]] = []
    paper_index = collect_papers(mineru_dir)
    for packet_path in sorted(packet_dir.glob("*.json")):
        if packet_path.name == "summary.json":
            continue
        packet = read_json(packet_path)
        reaction = packet.get("reaction", {}) if isinstance(packet, dict) else {}
        target = reaction.get("target", {}) if isinstance(reaction, dict) else {}
        literature_uuid = str(packet.get("literature_uuid") or "")
        paper_record = copy_paper_for_uuid(literature_uuid, paper_index, paper_output)
        shutil.copy2(packet_path, packet_output / packet_path.name)
        records.append(
            {
                "id": packet_path.name,
                "file_name": packet_path.name,
                "literature_uuid": literature_uuid,
                "reaction_id": reaction.get("reaction_id"),
                "target_name": target.get("name") if isinstance(target, dict) else None,
                "paper": paper_record,
            }
        )

    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "packet_count": len(records),
        "packets": records,
    }
    (output / "review_packet_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    linked_papers = len([item for item in records if item.get("paper")])
    unique_papers = len(list(paper_output.glob("*.pdf")))
    print(f"Copied {len(records)} packets into {relative(output)}")
    print(f"Linked {linked_papers} packet records to {unique_papers} unique source PDFs in {relative(paper_output)}")


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def collect_papers(mineru_dir: Path) -> dict[str, Path]:
    if not mineru_dir.is_dir():
        return {}
    papers: dict[str, Path] = {}
    for pdf_path in mineru_dir.glob("*/*_origin.pdf"):
        folder_uuid = normalize_uuidish(pdf_path.parent.name)
        file_uuid = normalize_uuidish(pdf_path.name.replace("_origin.pdf", ""))
        if folder_uuid:
            papers[folder_uuid] = pdf_path
        if file_uuid:
            papers[file_uuid] = pdf_path
    return papers


def copy_paper_for_uuid(literature_uuid: str, paper_index: dict[str, Path], paper_output: Path) -> dict[str, Any] | None:
    normalized = normalize_uuidish(literature_uuid)
    if not normalized:
        return None
    paper_path = paper_index.get(normalized)
    if not paper_path:
        return None
    target_name = f"{literature_uuid}_origin.pdf"
    target = paper_output / target_name
    if not target.is_file():
        shutil.copy2(paper_path, target)
    return {
        "file_name": target_name,
        "url": f"data/papers/{target_name}",
        "source_name": paper_path.name,
        "size_bytes": paper_path.stat().st_size,
    }


def normalize_uuidish(value: str) -> str:
    text = value.strip().lower().replace("-", "_")
    parts = text.split("_")
    if len(parts) == 5 and [len(part) for part in parts] == [8, 4, 4, 4, 12]:
        return text
    return ""


def relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(PROJECT_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


if __name__ == "__main__":
    main()
