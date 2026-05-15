from datetime import datetime

import pytest

from backend.seed import detect_units, is_likely_scanned, is_quality_chunk, parse_csv_date, split_text


# ---------- split_text ----------

def test_split_text_short_returns_single_chunk():
    text = "hello world"
    chunks = split_text(text, chunk_size=100, overlap=10)
    assert chunks == ["hello world"]


def test_split_text_respects_chunk_size():
    text = "a" * 5000
    chunks = split_text(text, chunk_size=1000, overlap=100)
    # Each chunk (except possibly the first) carries `overlap` extra chars of tail.
    assert all(len(c) <= 1000 + 100 for c in chunks)
    assert len(chunks) > 1


def test_split_text_overlap_present():
    text = ("paragraph one.\n\n" + "x" * 1500 + "\n\n" + "y" * 1500)
    chunks = split_text(text, chunk_size=1200, overlap=200)
    assert len(chunks) >= 2
    # Every chunk after the first starts with the tail of the previous one.
    for i in range(1, len(chunks)):
        prev_tail = chunks[i - 1][-200:]
        assert chunks[i].startswith(prev_tail)


def test_split_text_drops_empty_chunks():
    text = "\n\n\n\n   \n\n"
    chunks = split_text(text, chunk_size=100, overlap=0)
    assert chunks == []


# ---------- parse_csv_date ----------

def test_parse_csv_date_typical():
    assert parse_csv_date("02:35 05/07/2026") == datetime(2026, 5, 7, 2, 35)


def test_parse_csv_date_strips_whitespace():
    assert parse_csv_date("  23:00 12/31/2025  ") == datetime(2025, 12, 31, 23, 0)


def test_parse_csv_date_invalid_raises():
    with pytest.raises(ValueError):
        parse_csv_date("2026-05-07T02:35:00")


# ---------- detect_units ----------

def _rows(**cols):
    n = max(len(v) for v in cols.values())
    return [{k: (cols[k][i] if i < len(cols[k]) else "") for k in cols} for i in range(n)]


def test_detect_units_typical_freshwater_fahrenheit():
    rows = _rows(
        dissolved_oxygen=["2.9", "3.0", "5.5"],
        temperature=["63.5", "64.0", "65.5"],
        conductivity=["402", "410", "415"],
    )
    units, flags = detect_units(rows)
    assert units["dissolved_oxygen"] == "mg/L"
    assert units["temperature"] == "°F"
    assert units["conductivity"] == "µS/cm"
    assert units["ph"] == "unitless"
    assert units["orp"] == "mV"
    assert flags == []


def test_detect_units_flags_percent_saturation_do():
    rows = _rows(
        dissolved_oxygen=["75", "80", "95"],
        temperature=["63", "64", "65"],
        conductivity=["400"],
    )
    units, flags = detect_units(rows)
    assert units["dissolved_oxygen"] == "% saturation"
    assert any("saturation" in f for f in flags)


def test_detect_units_flags_celsius_temperature():
    rows = _rows(
        dissolved_oxygen=["5.0"],
        temperature=["10", "15", "20"],
        conductivity=["400"],
    )
    units, flags = detect_units(rows)
    assert units["temperature"] == "°C"
    assert any("°C" in f or "Celsius" in f.lower() for f in flags)


def test_is_likely_scanned_zero_text():
    assert is_likely_scanned("", n_pages=54) is True


def test_is_likely_scanned_normal_text():
    assert is_likely_scanned("a" * 100_000, n_pages=50) is False


def test_is_likely_scanned_sparse_text():
    # 49 chars/page → below threshold (50)
    assert is_likely_scanned("a" * 49 * 10, n_pages=10) is True
    # 51 chars/page → above threshold
    assert is_likely_scanned("a" * 51 * 10, n_pages=10) is False


def test_is_likely_scanned_zero_pages():
    assert is_likely_scanned("anything", n_pages=0) is False


# ---------- is_quality_chunk ----------

def test_is_quality_chunk_real_prose():
    text = (
        "Dissolved oxygen is the amount of gaseous oxygen dissolved in water. It enters "
        "the water through diffusion from the atmosphere, by aeration, and as a waste "
        "product of photosynthesis."
    )
    assert is_quality_chunk(text) is True


def test_is_quality_chunk_too_short():
    assert is_quality_chunk("Dissolved oxygen is good.") is False


def test_is_quality_chunk_low_alpha_ratio():
    # Mostly numbers and punctuation — looks like a table-of-contents page-number block.
    text = "1.1 ........... 12\n1.2 ........... 14\n1.3 ........... 16\n2.1 ........... 18\n2.2 ........... 22"
    assert is_quality_chunk(text) is False


def test_is_quality_chunk_boilerplate():
    text = (
        "An Adobe Acrobat Reader is required to view PDF documents. The most recent "
        "version of the Adobe Acrobat Reader is available as a free download from the "
        "Adobe website. Click here to download Adobe Reader."
    )
    assert is_quality_chunk(text) is False


def test_detect_units_skips_blank_cells():
    rows = _rows(
        dissolved_oxygen=["5.0", "", "NA"],
        temperature=["63", "", "NA"],
        conductivity=["400", "", ""],
    )
    units, _ = detect_units(rows)
    assert units["dissolved_oxygen"] == "mg/L"
    assert units["temperature"] == "°F"
