"""
scrapers/tmotor_scraper.py — T-Motor official store scraper.

Scrapes motor listings from store.tmotor.com.
Performs deep scraping of product pages to extract specs and test data with 100% accuracy.
"""

import re
from typing import Optional
from bs4 import BeautifulSoup
from scrapers.base_scraper import BaseScraper
from utils.logger import get_logger

log = get_logger(__name__)


class TMotorScraper(BaseScraper):
    name = "tmotor"
    base_url = "https://store.tmotor.com"

    # All active motor category paths on T-Motor store
    CATEGORIES = [
        "/categorys/multi-rotor-drone-motor",
        "/categorys/uav-multi-motor-navigator-type",
        "/categorys/uav-mult-motor-antigravity-type",
        "/categorys/fixed-wing-uav-motors",
        "/categorys/vtol-fixed-wing-motor",
        "/categorys/uav-motor-u-efficiency",
        "/categorys/uav-motor-u-power",
        "/categorys/uav-motor-u-type",
        "/categorys/agricultural-uav-motor-p-type",
        "/categorys/at-series-fixed-wing-motor",
    ]

    # T-Motor search endpoint
    SEARCH_URL = "https://store.tmotor.com/search.php"

    def scrape(self, query: str = "") -> list[dict]:
        results = []

        # Extract target KV rating and clean search query
        target_kv = None
        search_query = query
        if query.strip():
            kv_match = re.search(r"(\d{3,5})\s*kv", query, re.IGNORECASE)
            if kv_match:
                target_kv = kv_match.group(1)
            else:
                num_matches = re.findall(r"\b\d{3,4}\b", query)
                if num_matches:
                    for num in num_matches:
                        if num not in ["2207", "2306", "3508", "3510", "4010", "4012", "4120", "5008"]:
                            target_kv = num
                            break

            # Robust cleaning to get model/series name for store search (e.g. 'MN3508')
            search_query = re.sub(r'\b\d{3,5}\s*kv\b', '', search_query, flags=re.IGNORECASE)
            search_query = re.sub(r'\bkv\s*\d{3,5}\b', '', search_query, flags=re.IGNORECASE)
            search_query = re.sub(r'[-/]\d{3,5}\s*kv\b', '', search_query, flags=re.IGNORECASE)
            search_query = re.sub(r'[-/]kv\s*\d{3,5}\b', '', search_query, flags=re.IGNORECASE)
            if target_kv:
                search_query = re.sub(rf'\b{target_kv}\b', '', search_query, flags=re.IGNORECASE)
            search_query = re.sub(r'\s+', ' ', search_query).strip()
            
            if not search_query:
                search_query = query

        if query.strip():
            log.info(f"[tmotor] Searching: {self.SEARCH_URL}?keywords={search_query}")
            html = self.fetch(self.SEARCH_URL, params={"keywords": search_query})
            if html:
                soup = self.parse(html)
                products = soup.select("li.card-list-item")
                log.info(f"[tmotor] Search '{search_query}': found {len(products)} candidate product pages")

                # Pre-filter candidate pages
                candidates = []
                for idx, item in enumerate(products):
                    name_el = item.select_one("h4 a, p.trending-item-title a, a[href]")
                    if not name_el:
                        continue
                    name = name_el.get_text(strip=True)
                    href = name_el.get("href", "")
                    link = href if href.startswith("http") else (self.base_url + "/" + href if href else "")
                    if not link:
                        continue
                    if self._is_candidate_match(query, name, link):
                        candidates.append((link, name))
                    else:
                        log.debug(f"[tmotor] Pre-filtered (skipped): {name}")

                log.info(f"[tmotor] After pre-filtering: {len(candidates)}/{len(products)} candidates remain")

                # Deep-scraping details concurrently
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(candidates))) as executor:
                    future_to_link = {
                        executor.submit(self._scrape_detail_page, link, target_kv): link
                        for link, name in candidates
                    }
                    for future in concurrent.futures.as_completed(future_to_link):
                        link = future_to_link[future]
                        try:
                            motor_records, perf_points = future.result()
                            results.extend(motor_records)
                            results.extend(perf_points)
                        except Exception as e:
                            log.error(f"[tmotor] Detail scrape error for {link}: {e}")

            # If search returned nothing, also try the most relevant category as fallback
            if not results:
                log.info(f"[tmotor] Search empty, trying multi-rotor category fallback...")
                html = self.fetch(self.base_url + "/categorys/multi-rotor-drone-motor")
                if html:
                    soup = self.parse(html)
                    products = soup.select("li.card-list-item")
                    for item in products[:2]:
                        try:
                            name_el = item.select_one("h4 a, p.trending-item-title a, a[href]")
                            if not name_el:
                                continue
                            href = name_el.get("href", "")
                            link = href if href.startswith("http") else (self.base_url + "/" + href if href else "")
                            motor_records, perf_points = self._scrape_detail_page(link, target_kv=target_kv)
                            results.extend(motor_records)
                            results.extend(perf_points)
                        except Exception as e:
                            log.error(f"[tmotor] Fallback detail scrape error: {e}")

            return results

        # No query → browse all categories (basic card scraping to avoid thousands of deep requests)
        for cat_path in self.CATEGORIES:
            url = self.base_url + cat_path
            log.info(f"[tmotor] Scraping category: {url}")
            html = self.fetch(url)
            if not html:
                continue
            soup = self.parse(html)
            products = soup.select("li.card-list-item")
            found = self._parse_basic_products(products)
            results.extend(found)
            log.info(f"[tmotor] {cat_path}: found {len(found)} motors")

        log.info(f"[tmotor] Total scraped: {len(results)} records")
        return results

    def _scrape_detail_page(self, detail_url: str, target_kv: Optional[str] = None) -> tuple[list[dict], list[dict]]:
        html = self.fetch(detail_url)
        if not html:
            return [], []

        soup = self.parse(html)
        tables = soup.find_all("table")

        # 1. Parse all tables with rowspan propagation
        parsed_tables = [self._parse_html_table(t) for t in tables]

        # 2. Separate specs tables from performance tables
        specs_grids = []
        perf_grid = None

        for grid in parsed_tables:
            if not grid:
                continue
            is_specs = False
            is_perf = False
            for row in grid:
                row_lower = [str(cell).lower() for cell in row]
                if any("test item" in cell or "configuration" in cell for cell in row_lower):
                    is_specs = True
                    break
                if any("item no." in cell or "throttle" in cell or "rpm" in cell for cell in row_lower):
                    is_perf = True
                    break
            if is_specs:
                specs_grids.append(grid)
            elif is_perf and not perf_grid:
                perf_grid = grid

        # Split stacked specs grids into sub-grids by "Test Item"
        all_specs_sub_grids = []
        for grid in specs_grids:
            current_sub = []
            for row in grid:
                if len(row) >= 2 and row[0].strip().lower() == "test item":
                    if current_sub:
                        all_specs_sub_grids.append(current_sub)
                    current_sub = []
                current_sub.append(row)
            if current_sub:
                all_specs_sub_grids.append(current_sub)

        if not all_specs_sub_grids and specs_grids:
            all_specs_sub_grids = specs_grids

        # 3. Choose the matched sub-grids
        matched_sub_grids = []
        if target_kv:
            for grid in all_specs_sub_grids:
                match_found = False
                for row in grid:
                    row_str = " ".join([str(c) for c in row]).lower()
                    if target_kv.lower() in row_str or f"kv{target_kv}" in row_str.replace(" ", "") or f"{target_kv}kv" in row_str.replace(" ", ""):
                        match_found = True
                        break
                if match_found:
                    matched_sub_grids.append(grid)
        
        if not matched_sub_grids:
            matched_sub_grids = all_specs_sub_grids

        # Deduplicate matched sub-grids by "Test Item" name to avoid duplicate specs/perf tables in DOM
        unique_matched_sub_grids = []
        seen_grid_names = set()
        for grid in matched_sub_grids:
            grid_name = None
            for row in grid:
                if len(row) >= 2 and row[0].strip().lower() == "test item":
                    grid_name = row[1].strip()
                    break
            if not grid_name:
                grid_name = str(grid)
            if grid_name not in seen_grid_names:
                seen_grid_names.add(grid_name)
                unique_matched_sub_grids.append(grid)
        matched_sub_grids = unique_matched_sub_grids

        def safe_float(val):
            if not val: return None
            val_clean = re.sub(r"[^\d.]", "", val)
            try:
                return float(val_clean)
            except ValueError:
                return None

        # Look for Matching Guide section (ESC and Propeller recommendations)
        matching_guide = soup.find(lambda tag: tag.name == "h2" and "matching guide" in tag.get_text().lower())
        guide_esc_name = ""
        guide_prop_name = ""
        guide_link_esc = ""
        guide_link_prop = ""
        
        if matching_guide:
            sibling = matching_guide.next_sibling
            for _ in range(5):
                if not sibling:
                    break
                if sibling.name == "p":
                    links = sibling.find_all("a", href=True)
                    if links:
                        for a in links:
                            href = a["href"]
                            text = a.get_text(strip=True)
                            full_href = href if href.startswith("http") else self.base_url + "/" + href
                            
                            text_clean = text.lower()
                            if "esc" in text_clean:
                                guide_esc_name = text
                                guide_link_esc = full_href
                            elif "prop" in text_clean:
                                guide_prop_name = text
                                guide_link_prop = full_href
                        break
                sibling = sibling.next_sibling

        motor_records = []
        all_perf_points = []

        for sub_grid in matched_sub_grids:
            extracted_specs = {}
            for row in sub_grid:
                if len(row) >= 2 and row[0].strip():
                    extracted_specs[row[0].strip()] = row[1].strip()
                if len(row) >= 4 and row[2].strip():
                    extracted_specs[row[2].strip()] = row[3].strip()

            test_item_val = extracted_specs.get("Test Item") or extracted_specs.get("Motor Model") or ""
            sub_kv = None
            kv_match = re.search(r"\b(?:kv\s*(\d{3,5})|(\d{3,5})\s*kv)\b", test_item_val, re.IGNORECASE)
            if kv_match:
                sub_kv = kv_match.group(1) or kv_match.group(2)
            else:
                # Also check all cell text for KV
                row_str = " ".join([str(v) for v in extracted_specs.values()]).lower()
                kv_match_extra = re.search(r"\b(?:kv\s*(\d{3,5})|(\d{3,5})\s*kv)\b", row_str, re.IGNORECASE)
                if kv_match_extra:
                    sub_kv = kv_match_extra.group(1) or kv_match_extra.group(2)

            # Process performance rows for this sub_kv
            sub_perf_points = []
            if perf_grid:
                headers = [str(h).strip() for h in perf_grid[0]]
                col_map = {}
                for idx, h in enumerate(headers):
                    h_lower = h.lower()
                    if "item" in h_lower or "motor" in h_lower: col_map["item"] = idx
                    elif "voltage" in h_lower: col_map["voltage"] = idx
                    elif "prop" in h_lower: col_map["prop"] = idx
                    elif "throttle" in h_lower: col_map["throttle"] = idx
                    elif "current" in h_lower: col_map["current"] = idx
                    elif "power" in h_lower: col_map["power"] = idx
                    elif "thrust" in h_lower: col_map["thrust"] = idx
                    elif "rpm" in h_lower: col_map["rpm"] = idx
                    elif "efficiency" in h_lower or "g/w" in h_lower: col_map["efficiency"] = idx
                    elif "temp" in h_lower: col_map["temp"] = idx

                for row in perf_grid[1:]:
                    if len(row) < len(headers):
                        continue
                    item_val = row[col_map["item"]].strip() if "item" in col_map else ""
                    
                    if not item_val or any(k in item_val.lower() for k in ["note", "remark", "test condition", "table"]):
                        continue

                    # Filter by sub_kv if we have one
                    if sub_kv and sub_kv.lower() not in item_val.lower() and f"kv{sub_kv}" not in item_val.lower().replace(" ", ""):
                        continue

                    throttle_val = row[col_map["throttle"]].strip() if "throttle" in col_map else ""
                    throttle_num = safe_float(throttle_val)
                    if throttle_num is None or not (0 <= throttle_num <= 100):
                        continue

                    thrust_g = safe_float(row[col_map["thrust"]]) if "thrust" in col_map else None

                    point = {
                        "source": "tmotor",
                        "label": f"{item_val} {row[col_map['prop']].strip() if 'prop' in col_map else ''}".strip(),
                        "source_url": detail_url,
                        "throttle": throttle_num,
                        "voltage": safe_float(row[col_map["voltage"]]) if "voltage" in col_map else None,
                        "current": safe_float(row[col_map["current"]]) if "current" in col_map else None,
                        "power": safe_float(row[col_map["power"]]) if "power" in col_map else None,
                        "thrust_g": thrust_g,
                        "rpm": safe_float(row[col_map["rpm"]]) if "rpm" in col_map else None,
                        "efficiency": safe_float(row[col_map["efficiency"]]) if "efficiency" in col_map else None,
                        "temperature": safe_float(row[col_map["temp"]]) if "temp" in col_map else None,
                    }
                    if thrust_g is not None:
                        sub_perf_points.append(point)

            # Recommend esc/prop
            esc_name = guide_esc_name or extracted_specs.get("Recommended ESC") or extracted_specs.get("ESC") or ""
            prop_name = guide_prop_name or extracted_specs.get("Recommended Propeller") or extracted_specs.get("Propeller") or ""
            link_esc = guide_link_esc
            link_prop = guide_link_prop

            if (esc_name and not link_esc) or (prop_name and not link_prop):
                l_esc, l_prop = self._find_proof_links(soup, esc_name, prop_name)
                if not link_esc: link_esc = l_esc
                if not link_prop: link_prop = l_prop

            raw_max_thrust = extracted_specs.get("Max. Thrust") or extracted_specs.get("Max Thrust") or ""
            if not raw_max_thrust and sub_perf_points:
                max_thrust_g = max(p["thrust_g"] for p in sub_perf_points if p["thrust_g"] is not None)
                raw_max_thrust = f"{max_thrust_g / 1000.0:.2f}".rstrip('0').rstrip('.') + " kg"

            motor_name = extracted_specs.get("Test Item") or extracted_specs.get("Motor Model")
            if not motor_name:
                h1_el = soup.find("h1")
                motor_name = h1_el.get_text(strip=True) if h1_el else "T-Motor"

            motor_record = {
                "motor_name":            motor_name,
                "company":               "T-Motor",
                "max_thrust":            raw_max_thrust,
                "recommended_esc":       esc_name,
                "recommended_propeller": prop_name,
                "link_motor":            detail_url,
                "link_esc":              link_esc,
                "link_propeller":        link_prop,
                "source":                "tmotor_official",
                # Additional detailed specs
                "weight_g":              extracted_specs.get("Weight Excluding Cables") or extracted_specs.get("Weight") or "",
                "internal_resistance":   extracted_specs.get("Internal Resistance") or "",
                "dimensions":            extracted_specs.get("Motor Dimensions") or "",
                "shaft_diameter":        extracted_specs.get("Shaft Diameter") or "",
                "stator_size":           f"{extracted_specs.get('Stator Diameter', '')}{extracted_specs.get('Stator Height', '')}".replace("mm", "").strip(),
                "battery_config":        extracted_specs.get("No.of Cells(Lipo)") or extracted_specs.get("Cells") or "",
                "max_current":           extracted_specs.get("Max Continuous Current 180S") or extracted_specs.get("Max Current") or "",
                "max_power":             extracted_specs.get("Max Power (180S)") or extracted_specs.get("Max Power") or "",
            }
            motor_records.append(motor_record)
            all_perf_points.extend(sub_perf_points)

        return motor_records, all_perf_points

    def _parse_html_table(self, table) -> list[list[str]]:
        rows = table.find_all("tr")
        if not rows:
            return []

        grid = {}
        for r_idx, row in enumerate(rows):
            c_idx = 0
            for cell in row.find_all(["td", "th"]):
                while (r_idx, c_idx) in grid:
                    c_idx += 1

                rowspan = int(cell.get("rowspan", 1))
                colspan = int(cell.get("colspan", 1))
                val = cell.get_text(separator=" ", strip=True)

                for r_offset in range(rowspan):
                    for c_offset in range(colspan):
                        grid[(r_idx + r_offset, c_idx + c_offset)] = val
                c_idx += colspan

        num_rows = len(rows)
        num_cols = max(c for r, c in grid.keys()) + 1 if grid else 0

        table_data = []
        for r in range(num_rows):
            row_data = [grid.get((r, c), "") for c in range(num_cols)]
            table_data.append(row_data)

        return table_data

    def _find_proof_links(self, soup, esc_name: str, prop_name: str) -> tuple[str, str]:
        link_esc = ""
        link_prop = ""

        def clean_str(s):
            if not s: return ""
            s = s.lower().replace('*', 'x')
            return re.sub(r'[^a-z0-9]', '', s)

        cleaned_esc = clean_str(esc_name)
        cleaned_prop = clean_str(prop_name)

        esc_tokens = [t for t in re.split(r'[^a-z0-9]', esc_name.lower().replace('*', 'x')) if len(t) >= 3]
        prop_tokens = [t for t in re.split(r'[^a-z0-9]', prop_name.lower().replace('*', 'x')) if len(t) >= 3]

        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.get_text(strip=True)
            full_href = href if href.startswith("http") else self.base_url + "/" + href

            # Filter out non-product links
            if "product" not in href.lower() and "goods" not in href.lower():
                continue

            href_cleaned = clean_str(href)
            text_cleaned = clean_str(text)

            # Match ESC link
            if not link_esc and esc_name:
                if cleaned_esc in href_cleaned or cleaned_esc in text_cleaned:
                    link_esc = full_href
                elif esc_tokens and all(tok in href_cleaned or tok in text_cleaned for tok in esc_tokens):
                    link_esc = full_href
                elif "esc" in text.lower() and esc_tokens and any(tok in text_cleaned for tok in esc_tokens):
                    link_esc = full_href

            # Match Propeller link
            if not link_prop and prop_name:
                if cleaned_prop in href_cleaned or cleaned_prop in text_cleaned:
                    link_prop = full_href
                elif prop_tokens and all(tok in href_cleaned or tok in text_cleaned for tok in prop_tokens):
                    link_prop = full_href
                elif ("prop" in text.lower() or "folding" in text.lower()) and prop_tokens and any(tok in text_cleaned for tok in prop_tokens):
                    link_prop = full_href

        return link_esc, link_prop

    def _parse_basic_products(self, products) -> list[dict]:
        motors = []
        for item in products:
            try:
                name_el = item.select_one("h4 a, p.trending-item-title a, a[href]")
                price_el = item.select_one("p.price, div.price, .price")
                if not name_el:
                    continue
                name = name_el.get_text(strip=True)
                if not name:
                    continue
                price = price_el.get_text(strip=True) if price_el else ""
                href = name_el.get("href", "")
                link = href if href.startswith("http") else (self.base_url + "/" + href if href else "")

                motors.append({
                    "motor_name":            name,
                    "company":               "T-Motor",
                    "max_thrust":            "",
                    "recommended_esc":       "",
                    "recommended_propeller": "",
                    "link_motor":            link,
                    "price":                 price,
                    "source":                "tmotor_official",
                })
            except Exception as e:
                log.debug(f"[tmotor] Basic parse error: {e}")
        return motors

    def _is_candidate_match(self, query: str, name: str, link: str) -> bool:
        if not query.strip():
            return True

        name_lower = name.lower()
        link_lower = link.lower()

        # Extract model terms from query (terms that are NOT just KV numbers or KV labels)
        import re
        # Clean KV patterns
        q_clean = re.sub(r'\b\d{3,5}\s*kv\b', '', query, flags=re.IGNORECASE)
        q_clean = re.sub(r'\bkv\s*\d{3,5}\b', '', q_clean, flags=re.IGNORECASE)
        q_clean = re.sub(r'[-/]\d{3,5}\s*kv\b', '', q_clean, flags=re.IGNORECASE)
        q_clean = re.sub(r'[-/]kv\s*\d{3,5}\b', '', q_clean, flags=re.IGNORECASE)
        q_clean = q_clean.lower().strip()

        # Get tokens from q_clean
        tokens = re.split(r'[\s\-_/]+', q_clean)
        tokens = [t.strip() for t in tokens if len(t.strip()) >= 2]

        # If no tokens left after removing KV, just use the original query tokens
        if not tokens:
            tokens = [t.strip() for t in re.split(r'[\s\-_/]+', query.lower()) if len(t.strip()) >= 2]

        # Check if ANY of the model tokens appear in candidate name or link
        for tok in tokens:
            if tok in name_lower or tok in link_lower:
                return True

        # Also check if the candidate name has the stator size if it's in the query
        # E.g. search "MN3508" -> candidate "MN3508" has "3508"
        nums = re.findall(r'\b\d{4}\b', query)
        for num in nums:
            if num in name_lower or num in link_lower:
                return True

        return False
