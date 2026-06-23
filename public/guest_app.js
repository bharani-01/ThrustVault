// guest_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate user is guest or anonymous
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    const isAnonymous = !session;
    if (session && session.role !== 'guest' && session.role !== 'user' && session.role !== 'admin') {
        localStorage.removeItem('thrustvault_session');
        window.location.href = '/';
        return;
    }

    // Set email display in footer
    const email = session ? (session.email || '') : 'Anonymous Guest';
    const emailEl = document.getElementById('session-email');
    if (emailEl) emailEl.textContent = email;

    window.openMotorDetails = (motorId) => {
        if (window.showCustomAuthModal) {
            window.showCustomAuthModal("Sign In is required to view detailed motor profiles and testing telemetry charts. Sign in now?", '/login');
        } else {
            if (confirm("Sign In is required to view detailed motor profiles and testing telemetry charts. Sign in now?")) {
                window.location.href = '/login';
            }
        }
    };

    // XSS Escaping and URL Sanitization Utilities
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeUrl(url) {
        if (!url) return '';
        const trimmed = url.trim();
        if (/^(https?:\/\/|\/)/i.test(trimmed)) {
            return trimmed;
        }
        return '#';
    }


    function logUserActivity(email, role, action, details) {
        try {
            fetch('/api/guest/log-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role, action, details })
            }).catch(err => console.error("Error posting log:", err));
        } catch (e) {
            console.error("Error writing activity log:", e);
        }
    }
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials) {
        avatarInitials.textContent = isAnonymous ? 'G' : (email.charAt(0).toUpperCase() || 'G');
    }

    lucide.createIcons();

    let state = {
        motors: [],
        categories: [],
        activeCategory: null,
        searchQuery: '',
        filterCompany: 'all',
        sortBy: 'motor-asc',
        compareItems: [],
        chartInstances: {},
        currentPage: 1,
        pageSize: 15,
        categoryCounts: {},
        displayLimit: 8,
        totalFiltered: 0
    };

    let supabase = null;

    // DOM Elements
    const elements = {
        get catList() { return document.getElementById('category-list-container'); },
        motorsTableBody: document.getElementById('motors-list-rows'),
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        catBadge: document.getElementById('category-badge'),
        catTitle: document.getElementById('active-category-title'),
        catDesc: document.getElementById('active-category-desc'),
        catCount: document.getElementById('category-motors-count'),
        avgThrust: document.getElementById('category-avg-thrust'),
        topCompany: document.getElementById('category-top-company'),
        filteredCountBadge: document.getElementById('filtered-count-badge'),
        tableEmptyState: document.getElementById('table-empty-state'),
        btnClearFilters: document.getElementById('btn-clear-filters'),
        selectAllMotors: document.getElementById('select-all-motors'),
        
        // Modals & Drawers
        comparisonModal: document.getElementById('comparison-modal'),
        comparisonDrawer: document.getElementById('comparison-sidebar') || document.getElementById('comparison-drawer'),
        compareItemsContainer: document.getElementById('compare-check-list') || document.getElementById('compare-items-container'),
        compareCount: document.getElementById('compare-count') || { textContent: '' },
        comparisonResultTable: document.getElementById('comparison-result-table'),
        
        // Buttons
        btnCompareNow: document.getElementById('btn-compare-sidebar-now') || document.getElementById('btn-compare-now'),
        btnClearComparison: document.getElementById('btn-clear-comparison-sidebar') || document.getElementById('btn-clear-comparison'),
        btnCloseComparison: document.getElementById('btn-close-comparison-sidebar') || document.getElementById('btn-close-comparison'),
        get btnLogout() { return document.getElementById('btn-logout'); },
        
        // Search & Filters
        searchInput: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
        filterCompanySelect: document.getElementById('filter-company'),
        sortSelect: document.getElementById('sort-select'),
        
        // Verification Notes
        verificationNotesSection: document.getElementById('verification-notes-section'),
        verificationNotesToggle: document.getElementById('verification-notes-toggle'),
        verificationNotesBody: document.getElementById('verification-notes-rows')
    };

    // Static Official Verification Notes mapping
    const verificationNotes = {
        "18-22 kg": [
            {
                code: "TM-U15II",
                motor: "T-Motor U15 II KV80",
                source: "T-Motor Official Test Report",
                url: "https://shop.t-motor.com/goods.php?id=723",
                specs: "Tested at 50.4V (12S LiPo) with G40x13.1 Propeller. Max thrust: 21.2 kg at 110A."
            },
            {
                code: "TM-U15XXL",
                motor: "T-Motor U15 XXL KV60",
                source: "T-Motor Official Test Report",
                url: "https://shop.t-motor.com/goods.php?id=805",
                specs: "Tested at 58.8V (14S LiPo) with 4013 Carbon Propeller. Max thrust: 22.5 kg at 125A."
            }
        ],
        "10 kg": [
            {
                code: "TM-U12II",
                motor: "T-Motor U12 II KV120",
                source: "T-Motor Official Test Report",
                url: "https://shop.t-motor.com/goods.php?id=787",
                specs: "Tested at 50.4V (12S LiPo) with CF30x10.5 folding Propeller. Max thrust: 10.5 kg at 65A."
            },
            {
                code: "HW-X8",
                motor: "Hobbywing XRotor X8",
                source: "Hobbywing Official Spec Sheet",
                url: "https://www.hobbywing.com/en/products/xrotor-x8-p65.html",
                specs: "Integrated 80A 12S ESC, 3090 Folding Propeller. Max thrust: 9.8 kg at 60A."
            }
        ]
    };

    // Helper: Parse thrust strings to numerical kg
    function parseThrustToKg(thrustStr) {
        if (!thrustStr) return 0;
        const normalized = thrustStr.trim().toLowerCase().replace(/\s+/g, '');
        const match = normalized.match(/^([0-9.]+)(kg|g)?$/);
        if (match) {
            const val = parseFloat(match[1]);
            const unit = match[2] || 'kg';
            return unit === 'g' ? val / 1000 : val;
        }
        const numbers = normalized.match(/[0-9.]+/);
        if (numbers) {
            const val = parseFloat(numbers[0]);
            return (normalized.includes('g') && !normalized.includes('kg')) ? val / 1000 : val;
        }
        return 0;
    }

    async function fetchMotorsForActiveCategory() {
        if (!state.activeCategory) {
            state.motors = [];
            return;
        }
        try {
            const motorRes = await fetch(`/api/guest/motors?category_id=eq.${state.activeCategory}`);
            if (!motorRes.ok) throw new Error(`Motors fetch failed: HTTP ${motorRes.status}`);
            const motors = await motorRes.json();
            
            state.motors = (motors || []).map(m => ({
                id: m.id,
                categoryId: m.category_id,
                motor: m.motor_name,
                company: m.company,
                thrust: m.max_thrust,
                esc: m.recommended_esc,
                prop: m.recommended_propeller,
                linkMotor: m.link_motor,
                linkEsc: m.link_esc,
                linkProp: m.link_propeller,
                custom_parameters: m.custom_parameters || {},
                uploaded_by: m.uploaded_by,
                mainImage: m.main_image,
                galleryImages: m.gallery_images
            }));
        } catch (e) {
            console.error("Error loading motors:", e);
            state.motors = [];
        }
    }

    // Data Fetching from Proxy
    async function fetchData() {
        try {
            // Fetch categories ordered by name
            const catRes = await fetch('/api/guest/categories');
            if (!catRes.ok) throw new Error(`Categories fetch failed: HTTP ${catRes.status}`);
            const categories = await catRes.json();
            
            const parseMinWeight = (name) => {
                const match = name.match(/(\d+)/);
                return match ? parseInt(match[1], 10) : 9999;
            };

            state.categories = (categories || []).map(c => ({
                id: c.id,
                name: c.name,
                desc: c.description
            })).sort((a, b) => parseMinWeight(a.name) - parseMinWeight(b.name));
            
            // Fetch category IDs only to compute counts
            const countRes = await fetch('/api/guest/motors?select=category_id');
            if (countRes.ok) {
                const categoryIds = await countRes.json();
                state.categoryCounts = {};
                (categoryIds || []).forEach(m => {
                    if (m.category_id) {
                        state.categoryCounts[m.category_id] = (state.categoryCounts[m.category_id] || 0) + 1;
                    }
                });
            } else {
                state.categoryCounts = {};
            }
            
            // Fetch dynamic schema custom definitions
            let customSchema = [];
            try {
                const schemaRes = await fetch('/api/guest/custom-specs');
                if (schemaRes.ok) {
                    customSchema = await schemaRes.json();
                } else {
                    throw new Error(`HTTP ${schemaRes.status}`);
                }
            } catch (err) {
                console.warn("Falling back to localStorage for custom schema:", err);
                customSchema = JSON.parse(localStorage.getItem('thrustvault_custom_specs')) || [];
            }
            state.customSchema = customSchema;
            
            if (state.categories.length > 0) {
                if (!state.activeCategory || !state.categories.some(c => c.id === state.activeCategory)) {
                    state.activeCategory = state.categories[0].id;
                }
            } else {
                state.activeCategory = null;
            }
            
            await fetchMotorsForActiveCategory();
            
            renderApp();
        } catch (e) {
            console.error("Error fetching data:", e);
        }
    }

    function renderApp() {
        renderSidebar();
        renderMainContent();
        renderCharts();
        updateStats();
        updateComparisonDrawer();
        lucide.createIcons();
    }

    function updateStats() {
        if (elements.totalMotors) {
            const total = Object.values(state.categoryCounts || {}).reduce((a, b) => a + b, 0);
            elements.totalMotors.textContent = total;
        }
        if (elements.totalCats) {
            elements.totalCats.textContent = state.categories.length;
        }
    }

    // Sidebar Category Rendering
    function renderSidebar() {
        if (!elements.catList) return;
        elements.catList.innerHTML = '';
        state.categories.forEach(cat => {
            const count = state.categoryCounts[cat.id] || 0;
            const div = document.createElement('div');
            div.className = `category-tab ${state.activeCategory === cat.id ? 'active' : ''}`;
            div.innerHTML = `
                <span>${cat.name}</span>
                <span class="cat-count">${count}</span>
            `;
            
            div.onclick = async () => {
                state.activeCategory = cat.id;
                state.filterCompany = 'all';
                state.searchQuery = '';
                state.currentPage = 1;
                elements.searchInput.value = '';
                elements.searchClear.style.display = 'none';
                
                const tbody = elements.motorsTableBody;
                if (tbody) {
                    tbody.innerHTML = `
                        <tr class="skeleton-row">
                            <td colspan="11"><div class="shimmer" style="height:32px; border-radius:4px; margin:8px 0;"></div></td>
                        </tr>
                    `;
                }
                
                await fetchMotorsForActiveCategory();
                renderApp();
            };
            elements.catList.appendChild(div);
        });
    }

    // Main Content Rendering
    function renderMainContent() {
        const cat = state.categories.find(c => c.id === state.activeCategory);
        if(!cat) {
            elements.catBadge.textContent = "N/A";
            elements.catTitle.textContent = "No Category Selected";
            elements.catDesc.textContent = "There are no motor categories loaded in the database.";
            elements.motorsTableBody.innerHTML = '';
            elements.filteredCountBadge.textContent = "0 displayed";
            elements.avgThrust.textContent = "N/A";
            elements.topCompany.textContent = "N/A";
            if (elements.verificationNotesSection) elements.verificationNotesSection.style.display = 'none';
            return;
        }
        
        elements.catBadge.textContent = cat.name;
        elements.catTitle.textContent = `${cat.name} Class`;
        elements.catDesc.textContent = cat.desc || `${cat.name} Thrust Stand Motors`;
        
        const catMotors = state.motors.filter(m => m.categoryId === cat.id);
        
        // Update Brand Filter Dropdown Options
        updateBrandFilterOptions(catMotors);
        
        // Apply Filters
        let filteredMotors = [...catMotors];
        
        if (state.filterCompany !== 'all') {
            filteredMotors = filteredMotors.filter(m => m.company === state.filterCompany);
        }
        
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            filteredMotors = filteredMotors.filter(m => 
                m.motor.toLowerCase().includes(q) || 
                m.company.toLowerCase().includes(q) ||
                (m.esc && m.esc.toLowerCase().includes(q)) ||
                (m.prop && m.prop.toLowerCase().includes(q))
            );
        }

        // Apply Sorting
        filteredMotors.sort((a, b) => {
            if (state.sortBy === 'motor-asc') {
                return a.motor.localeCompare(b.motor);
            } else if (state.sortBy === 'motor-desc') {
                return b.motor.localeCompare(a.motor);
            } else if (state.sortBy === 'company-asc') {
                return a.company.localeCompare(b.company);
            } else if (state.sortBy === 'thrust-desc') {
                return parseThrustToKg(b.thrust) - parseThrustToKg(a.thrust);
            } else if (state.sortBy === 'thrust-asc') {
                return parseThrustToKg(a.thrust) - parseThrustToKg(b.thrust);
            }
            return 0;
        });
        
        // Update Quick Stats
        calculateCategoryQuickStats(catMotors);
        
        elements.filteredCountBadge.textContent = `${filteredMotors.length} displayed`;
        
        state.totalFiltered = filteredMotors.length;
        const totalItems = filteredMotors.length;
        const totalPages = Math.ceil(totalItems / state.pageSize);
        if (state.currentPage > totalPages) {
            state.currentPage = totalPages || 1;
        }
        if (state.currentPage < 1) {
            state.currentPage = 1;
        }
        const startIndex = (state.currentPage - 1) * state.pageSize;
        const paginatedMotors = filteredMotors.slice(startIndex, startIndex + state.pageSize);
        
        // Show/Hide Empty State
        if (totalItems === 0) {
            elements.tableEmptyState.style.display = 'block';
            document.getElementById('motors-data-table').style.display = 'none';
        } else {
            elements.tableEmptyState.style.display = 'none';
            document.getElementById('motors-data-table').style.display = 'table';
        }
        
        // Render rows without editing/deleting controls (11 columns matching layout)
        elements.motorsTableBody.innerHTML = '';
        paginatedMotors.forEach((m) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors';
            const isChecked = state.compareItems.includes(m.id);
            if (isChecked) {
                tr.classList.add('bg-blue-50/40', 'dark:bg-blue-950/20');
            }
            
            const initials = m.motor.charAt(0).toUpperCase();
            
            // Dynamic accent color for thumbnail based on company name hash
            const hash = m.company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const thumbHue = hash % 360;
            const thumbStyle = `background: hsl(${thumbHue}, 80%, 95%); color: hsl(${thumbHue}, 80%, 40%); border-color: hsl(${thumbHue}, 80%, 85%);`;
            
            // Extract KV
            const kvMatch = m.motor.match(/(\d+)\s*KV/i) || m.motor.match(/KV\s*(\d+)/i);
            const kv = kvMatch ? `${kvMatch[1]} KV` : (m.custom_parameters && (m.custom_parameters.kv || m.custom_parameters.kv_rating) ? m.custom_parameters.kv || m.custom_parameters.kv_rating : '-');
            
            // Extract Voltage
            const voltage = m.custom_parameters && (m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) ? String(m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) : (m.motor.match(/\b\d+S\b/i) || m.esc?.match(/\b\d+S\b/i) || ['-'])[0];
            
            // Extract Weight
            const weightVal = m.custom_parameters && (m.custom_parameters.weight || m.custom_parameters.weight_g || m.custom_parameters.motor_weight) ? m.custom_parameters.weight || m.custom_parameters.weight_g || m.custom_parameters.motor_weight : null;
            const weight = weightVal ? `${weightVal} g` : '-';
            const links = [];
            if (m.linkMotor) {
                links.push(`<a href="${sanitizeUrl(m.linkMotor)}" target="_blank" title="Motor Specs"><i data-lucide="cpu" style="width:14px;height:14px;"></i></a>`);
            }
            if (m.linkEsc) {
                links.push(`<a href="${sanitizeUrl(m.linkEsc)}" target="_blank" title="ESC Specs"><i data-lucide="zap" style="width:14px;height:14px;"></i></a>`);
            }
            if (m.linkProp) {
                links.push(`<a href="${sanitizeUrl(m.linkProp)}" target="_blank" title="Propeller Specs"><i data-lucide="wind" style="width:14px;height:14px;"></i></a>`);
            }
            const linksHtml = links.length > 0 ? links.join(' ') : '-';
            
            let imageHtml = '';
            if (m.mainImage && m.mainImage.startsWith('http')) {
                imageHtml = `
                    <div class="motor-thumbnail mx-auto">
                        <img src="${sanitizeUrl(m.mainImage)}" alt="${escapeHTML(m.motor)}" class="w-full h-full object-cover">
                    </div>
                `;
            } else {
                imageHtml = `<div class="motor-thumbnail mx-auto" style="${thumbStyle}">${initials}</div>`;
            }
            
            tr.innerHTML = `
                <td class="py-3 px-2 text-center"><input type="checkbox" class="compare-cb rounded border-slate-300 dark:border-slate-700 dark:bg-slate-950 text-[#003366] dark:text-blue-500 focus:ring-[#003366]/20" data-id="${m.id}" ${isChecked ? 'checked' : ''}></td>
                <td class="py-3 px-2 text-center">${imageHtml}</td>
                <td class="py-3 px-2"><a href="#" class="motor-profile-link text-[#003366] hover:text-[#001e40] dark:text-[#a7c8ff] dark:hover:text-[#d5e3ff] font-semibold" data-id="${m.id}">${escapeHTML(m.motor)}</a></td>
                <td class="py-3 px-2 text-slate-600 dark:text-slate-400">${escapeHTML(m.company)}</td>
                <td class="py-3 px-2 text-slate-800 dark:text-slate-200"><strong>${escapeHTML(kv)}</strong></td>
                <td class="py-3 px-2"><span class="badge-thrust px-2 py-0.5 text-xs rounded-full" style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); color: var(--primary-color);">${escapeHTML(voltage)}</span></td>
                <td class="py-3 px-2"><span class="badge-thrust px-2 py-0.5 text-xs rounded-full bg-emerald-50/50 border border-emerald-200/60 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-400">${escapeHTML(m.thrust)}</span></td>
                <td class="py-3 px-2 text-slate-600 dark:text-slate-400">${escapeHTML(weight)}</td>
                <td class="py-3 px-2 text-slate-600 dark:text-slate-400 text-xs max-w-[150px] truncate" title="${escapeHTML(m.prop || '-')}">${escapeHTML(m.prop || '-')}</td>
                <td class="py-3 px-2 text-slate-600 dark:text-slate-400 text-xs max-w-[130px] truncate" title="${escapeHTML(m.esc || '-')}">${escapeHTML(m.esc || '-')}</td>
                <td class="py-3 px-2 text-center"><div class="action-links flex items-center justify-center gap-1.5">${linksHtml}</div></td>
            `;
            elements.motorsTableBody.appendChild(tr);
        });
        
        bindRowActions();
        
        // Notes Panel
        renderVerificationNotes(cat.name);
        renderPagination(totalItems, paginatedMotors.length);
    }

    function renderPagination(totalItems, displayedCount) {
        const pagControls = document.getElementById('pagination-controls');
        if (!pagControls) return;

        if (totalItems === 0) {
            pagControls.style.display = 'none';
            return;
        }
        pagControls.style.display = 'flex';

        // Display pagination pages, buttons, and limits dropdown
        const pagesContainer = document.getElementById('pagination-pages');
        if (pagesContainer) pagesContainer.style.display = '';
        
        const btnPrev = document.getElementById('btn-prev-page');
        if (btnPrev) btnPrev.style.display = '';
        
        const btnNext = document.getElementById('btn-next-page');
        if (btnNext) btnNext.style.display = '';
        
        const limitSelect = document.getElementById('pagination-limit');
        if (limitSelect) {
            limitSelect.style.display = '';
            limitSelect.value = state.pageSize;
        }

        const totalPages = Math.ceil(totalItems / state.pageSize);
        
        // Ensure currentPage is valid
        if (state.currentPage > totalPages) {
            state.currentPage = totalPages || 1;
        }
        if (state.currentPage < 1) {
            state.currentPage = 1;
        }

        // Enable/disable prev/next buttons
        if (btnPrev) {
            if (state.currentPage === 1) {
                btnPrev.classList.add('opacity-50', 'pointer-events-none');
                btnPrev.disabled = true;
            } else {
                btnPrev.classList.remove('opacity-50', 'pointer-events-none');
                btnPrev.disabled = false;
            }
        }
        if (btnNext) {
            if (state.currentPage === totalPages || totalPages === 0) {
                btnNext.classList.add('opacity-50', 'pointer-events-none');
                btnNext.disabled = true;
            } else {
                btnNext.classList.remove('opacity-50', 'pointer-events-none');
                btnNext.disabled = false;
            }
        }

        // Update range info text
        const infoText = document.getElementById('pagination-info-text');
        if (infoText) {
            const startIdx = totalItems === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
            const endIdx = Math.min(state.currentPage * state.pageSize, totalItems);
            infoText.textContent = `Showing ${startIdx}-${endIdx} of ${totalItems} motors`;
        }

        // Render page buttons
        if (pagesContainer) {
            pagesContainer.innerHTML = '';
            const pageNumbers = getPageNumbers(state.currentPage, totalPages);
            pageNumbers.forEach(page => {
                if (page === '...') {
                    const span = document.createElement('span');
                    span.className = 'px-2 py-1 text-slate-400 dark:text-slate-600 font-medium';
                    span.textContent = '...';
                    pagesContainer.appendChild(span);
                } else {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    if (page === state.currentPage) {
                        btn.className = 'px-3 py-1.5 rounded text-xs font-semibold bg-[#003366] text-white dark:bg-blue-600 dark:text-white border border-[#003366] dark:border-blue-600 transition-all';
                    } else {
                        btn.className = 'px-3 py-1.5 rounded text-xs bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-colors text-slate-600 dark:text-slate-300 font-medium';
                    }
                    btn.textContent = page;
                    btn.onclick = () => {
                        state.currentPage = page;
                        renderMainContent();
                    };
                    pagesContainer.appendChild(btn);
                }
            });
        }
    }

    function getPageNumbers(currentPage, totalPages) {
        const pages = [];
        const maxVisible = 5;
        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);
            
            if (currentPage <= 3) {
                end = 4;
            } else if (currentPage >= totalPages - 2) {
                start = totalPages - 3;
            }
            
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    }

    function bindRowActions() {
        elements.motorsTableBody.querySelectorAll('.compare-cb').forEach(cb => {
            cb.onchange = () => {
                const id = cb.dataset.id;
                if (cb.checked) {
                    if (state.compareItems.length >= 3) {
                        alert("You can compare a maximum of 3 motors.");
                        cb.checked = false;
                        return;
                    }
                    state.compareItems.push(id);
                } else {
                    state.compareItems = state.compareItems.filter(item => item !== id);
                }
                updateComparisonDrawer();
            };
        });

        // Motor profile click handlers (require Sign In)
        elements.motorsTableBody.querySelectorAll('.motor-profile-link').forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.showCustomAuthModal) {
                    window.showCustomAuthModal("Sign In is required to view detailed motor profiles and testing telemetry charts. Sign in now?", '/login');
                } else {
                    if (confirm("Sign In is required to view detailed motor profiles and testing telemetry charts. Sign in now?")) {
                        window.location.href = '/login';
                    }
                }
            };
        });
    }

    function updateBrandFilterOptions(catMotors) {
        const currentVal = elements.filterCompanySelect.value;
        const brands = [...new Set(catMotors.map(m => m.company))].sort();
        
        elements.filterCompanySelect.innerHTML = '<option value="all">All Brands</option>' + 
            brands.map(b => `<option value="${b}">${b}</option>`).join('');
            
        if (brands.includes(currentVal)) {
            elements.filterCompanySelect.value = currentVal;
            state.filterCompany = currentVal;
        } else {
            elements.filterCompanySelect.value = 'all';
            state.filterCompany = 'all';
        }
    }

    function calculateCategoryQuickStats(catMotors) {
        if (elements.catCount) {
            elements.catCount.textContent = catMotors.length;
        }
        if (catMotors.length > 0) {
            let sumThrust = 0;
            let validThrustCount = 0;
            catMotors.forEach(m => {
                const parsed = parseThrustToKg(m.thrust);
                if (parsed > 0) {
                    sumThrust += parsed;
                    validThrustCount++;
                }
            });
            if (validThrustCount > 0) {
                elements.avgThrust.textContent = `${(sumThrust / validThrustCount).toFixed(2)} kg`;
            } else {
                elements.avgThrust.textContent = "N/A";
            }
            
            const brandCounts = {};
            catMotors.forEach(m => { brandCounts[m.company] = (brandCounts[m.company] || 0) + 1; });
            let topBrand = 'N/A';
            let maxCount = 0;
            for (const [brand, count] of Object.entries(brandCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    topBrand = brand;
                }
            }
            elements.topCompany.textContent = topBrand;
        } else {
            elements.avgThrust.textContent = 'N/A';
            elements.topCompany.textContent = 'N/A';
        }
    }

    function renderVerificationNotes(categoryName) {
        if (!elements.verificationNotesSection || !elements.verificationNotesBody) return;
        const notes = verificationNotes[categoryName];
        if (notes && notes.length > 0) {
            elements.verificationNotesSection.style.display = 'block';
            elements.verificationNotesBody.innerHTML = notes.map(n => `
                <tr>
                    <td><code>${n.code}</code></td>
                    <td><strong>${n.motor}</strong></td>
                    <td>
                        <a href="${n.url}" target="_blank" class="verification-link">
                            <i data-lucide="shield-check" class="text-success" style="width:14px; vertical-align:middle; margin-right:4px;"></i>
                            ${n.source}
                        </a>
                    </td>
                    <td>${n.specs}</td>
                </tr>
            `).join('');
            lucide.createIcons();
        } else {
            elements.verificationNotesSection.style.display = 'none';
        }
    }

    function updateComparisonDrawer() {
        const count = state.compareItems.length;
        elements.compareCount.textContent = `${count} / 3`;
        
        if (count > 0) {
            elements.comparisonDrawer.classList.add('show');
            elements.compareItemsContainer.innerHTML = state.compareItems.map(id => {
                const m = state.motors.find(x => x.id === id);
                if (!m) return '';
                return `
                    <div class="compare-item">
                        <div>
                            <div class="compare-item-info">${m.motor}</div>
                            <div class="compare-item-brand">${m.company}</div>
                        </div>
                        <button class="btn-icon-smallClose btn-remove-compare" data-id="${m.id}" title="Remove"><i data-lucide="x" style="width:14px;"></i></button>
                    </div>
                `;
            }).join('');
            
            elements.compareItemsContainer.querySelectorAll('.btn-remove-compare').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.id;
                    state.compareItems = state.compareItems.filter(item => item !== id);
                    updateComparisonDrawer();
                    const cb = elements.motorsTableBody.querySelector(`.compare-cb[data-id="${id}"]`);
                    if (cb) cb.checked = false;
                };
            });
            lucide.createIcons();
        } else {
            elements.comparisonDrawer.classList.remove('show');
            elements.compareItemsContainer.innerHTML = '';
        }
        
        if (elements.btnCompareNow) {
            elements.btnCompareNow.disabled = (count === 0);
        }
    }

    // Modal Compare
    if (elements.btnCompareNow) {
        elements.btnCompareNow.onclick = () => {
            if (state.compareItems.length === 0) return;
        const selected = state.compareItems.map(id => state.motors.find(m => m.id === id)).filter(Boolean);
        
        let customRowsHtml = '';
        if (state.customSchema && state.customSchema.length > 0) {
            state.customSchema.forEach(f => {
                customRowsHtml += `
                    <tr>
                        <td><strong>${f.field_name}</strong></td>
                        ${selected.map(m => {
                            const val = m.custom_parameters && m.custom_parameters[f.field_key] !== undefined ? m.custom_parameters[f.field_key] : '-';
                            if (f.field_type === 'boolean') {
                                return `<td>${val === true || val === 'true' ? '<span style="color:#059669;font-weight:700;">Yes</span>' : '<span style="color:#e11d48;font-weight:700;">No</span>'}</td>`;
                            }
                            return `<td>${val} ${val !== '-' && f.field_unit && val !== '' ? f.field_unit : ''}</td>`;
                        }).join('')}
                    </tr>
                `;
            });
        }

        elements.comparisonResultTable.innerHTML = `
            <thead>
                <tr>
                    <th>Specification</th>
                    ${selected.map(m => `<th>${m.motor}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Manufacturer</strong></td>
                    ${selected.map(m => `<td>${m.company}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Max Thrust</strong></td>
                    ${selected.map(m => `<td>${m.thrust}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Recommended ESC</strong></td>
                    ${selected.map(m => `<td>${m.esc || '-'}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Recommended Propeller</strong></td>
                    ${selected.map(m => `<td>${m.prop || '-'}</td>`).join('')}
                </tr>
                ${customRowsHtml}
                <tr>
                    <td><strong>Reference Links</strong></td>
                    ${selected.map(m => `
                        <td>
                            <div style="display:flex; flex-direction:column; gap:5px;">
                                ${m.linkMotor ? `<a href="${m.linkMotor}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="cpu" style="width:14px;"></i> Motor Page</a>` : ''}
                                ${m.linkEsc ? `<a href="${m.linkEsc}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="zap" style="width:14px;"></i> ESC Page</a>` : ''}
                                ${m.linkProp ? `<a href="${m.linkProp}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="wind" style="width:14px;"></i> Prop Page</a>` : ''}
                                ${!m.linkMotor && !m.linkEsc && !m.linkProp ? '-' : ''}
                            </div>
                        </td>
                    `).join('')}
                </tr>
            </tbody>
        `;
        if (elements.comparisonModal) {
            openModal(elements.comparisonModal);
        }
        if (window.lucide) {
            lucide.createIcons();
        }
    };
    }

    if (elements.btnClearComparison) {
        elements.btnClearComparison.onclick = () => {
            state.compareItems = [];
            updateComparisonDrawer();
            const cbs = elements.motorsTableBody ? elements.motorsTableBody.querySelectorAll('.compare-cb') : [];
            cbs.forEach(cb => cb.checked = false);
            if (elements.selectAllMotors) elements.selectAllMotors.checked = false;
        };
    }
    if (elements.btnCloseComparison) {
        elements.btnCloseComparison.onclick = () => {
            state.compareItems = [];
            updateComparisonDrawer();
            const cbs = elements.motorsTableBody ? elements.motorsTableBody.querySelectorAll('.compare-cb') : [];
            cbs.forEach(cb => cb.checked = false);
            if (elements.selectAllMotors) elements.selectAllMotors.checked = false;
        };
    }

    // Table Select All
    if (elements.selectAllMotors) {
        elements.selectAllMotors.onchange = () => {
            const visibleCbs = elements.motorsTableBody ? elements.motorsTableBody.querySelectorAll('.compare-cb') : [];
            const isChecked = elements.selectAllMotors.checked;
            
            visibleCbs.forEach(cb => {
                const id = cb.dataset.id;
                if (isChecked) {
                    if (!state.compareItems.includes(id)) {
                        if (state.compareItems.length < 3) {
                            cb.checked = true;
                            state.compareItems.push(id);
                        } else {
                            cb.checked = false;
                        }
                    }
                } else {
                    cb.checked = false;
                    state.compareItems = state.compareItems.filter(item => item !== id);
                }
            });
            updateComparisonDrawer();
        };
    }

    function calculateCompleteness(m) {
        const coreFields = ['recommended_esc', 'recommended_propeller', 'link_motor', 'link_esc', 'link_propeller'];
        let filled = 0;
        let total = coreFields.length;
        
        coreFields.forEach(f => {
            const hasVal = m[f] || 
                           (f === 'recommended_esc' && m.esc) || 
                           (f === 'recommended_propeller' && m.prop) || 
                           (f === 'link_motor' && m.linkMotor) || 
                           (f === 'link_esc' && m.linkEsc) || 
                           (f === 'link_propeller' && m.linkProp);
            if (hasVal) {
                filled++;
            }
        });
        
        if (state.customSchema && state.customSchema.length > 0) {
            state.customSchema.forEach(field => {
                total++;
                const val = m.custom_parameters ? m.custom_parameters[field.key] : null;
                if (val !== undefined && val !== null && val !== '') {
                    filled++;
                }
            });
        }
        
        return Math.round((filled / total) * 100);
    }

    function calculateVoltageRange(catMotors, cat) {
        let sRatings = [];
        catMotors.forEach(m => {
            const v = m.custom_parameters && (m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) ? String(m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) : '';
            const esc = m.esc || '';
            const name = m.motor || '';
            
            const match = v.match(/(\d+)s/i) || esc.match(/(\d+)s/i) || name.match(/(\d+)s/i);
            if (match) {
                sRatings.push(parseInt(match[1]));
            }
        });
        
        if (sRatings.length > 0) {
            const min = Math.min(...sRatings);
            const max = Math.max(...sRatings);
            return min === max ? `${min}S` : `${min}S - ${max}S`;
        }
        
        if (cat && cat.desc) {
            const descMatch = cat.desc.match(/(\d+)S\s*–\s*(\d+)S/i) || cat.desc.match(/(\d+)S\s*-\s*(\d+)S/i);
            if (descMatch) {
                return `${descMatch[1]}S - ${descMatch[2]}S`;
            }
        }
        return 'N/A';
    }

    function updateKpis(catMotors, cat) {
        const kpiTotal = document.getElementById('kpi-total-motors-val');
        if (kpiTotal) kpiTotal.textContent = catMotors.length;
        
        const kpiAvg = document.getElementById('kpi-avg-thrust-val');
        if (kpiAvg) {
            let sumThrust = 0;
            let countThrust = 0;
            catMotors.forEach(m => {
                const parsed = parseThrustToKg(m.thrust);
                if (parsed > 0) {
                    sumThrust += parsed;
                    countThrust++;
                }
            });
            kpiAvg.textContent = countThrust > 0 ? `${(sumThrust / countThrust).toFixed(2)} kg` : 'N/A';
        }
        
        const kpiMax = document.getElementById('kpi-max-thrust-val');
        if (kpiMax) {
            let maxThrust = 0;
            catMotors.forEach(m => {
                const parsed = parseThrustToKg(m.thrust);
                if (parsed > maxThrust) maxThrust = parsed;
            });
            kpiMax.textContent = maxThrust > 0 ? `${maxThrust.toFixed(2)} kg` : 'N/A';
        }
        
        const kpiBrands = document.getElementById('kpi-brands-val');
        if (kpiBrands) {
            const brands = new Set(catMotors.map(m => m.company));
            kpiBrands.textContent = brands.size;
        }
        
        const kpiVoltage = document.getElementById('kpi-voltage-val');
        if (kpiVoltage) {
            kpiVoltage.textContent = calculateVoltageRange(catMotors, cat);
        }
        
        const kpiCompleteness = document.getElementById('kpi-completeness-val');
        if (kpiCompleteness) {
            let sumCompleteness = 0;
            catMotors.forEach(m => {
                sumCompleteness += calculateCompleteness(m);
            });
            const avgCompleteness = catMotors.length > 0 ? Math.round(sumCompleteness / catMotors.length) : 0;
            kpiCompleteness.textContent = `${avgCompleteness}%`;
        }
        
        const kpiActive = document.getElementById('kpi-active-class-val');
        if (kpiActive) {
            kpiActive.textContent = cat ? cat.name : '-';
        }
    }

    function renderBrandTreemap(catMotors) {
        const container = document.getElementById('brand-treemap-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (catMotors.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:20px; text-align:center; width:100%;">No data to display</div>';
            return;
        }
        
        const counts = {};
        catMotors.forEach(m => {
            counts[m.company] = (counts[m.company] || 0) + 1;
        });
        
        const sortedBrands = Object.entries(counts)
            .map(([name, count]) => ({
                name,
                count,
                percentage: (count / catMotors.length) * 100
            }))
            .sort((a, b) => b.count - a.count);
        
        const colors = [
            'hsl(217, 91%, 60%)',
            'hsl(142, 72%, 29%)',
            'hsl(200, 95%, 45%)',
            'hsl(160, 84%, 39%)',
            'hsl(224, 76%, 48%)',
            'hsl(180, 70%, 40%)',
            'hsl(210, 40%, 50%)',
            'hsl(140, 50%, 60%)',
        ];
        
        sortedBrands.forEach((item, index) => {
            const block = document.createElement('div');
            block.className = 'treemap-block';
            block.style.flexGrow = item.count;
            block.style.backgroundColor = colors[index % colors.length];
            block.style.flexBasis = `${Math.max(80, item.percentage * 2.5)}px`;
            
            block.innerHTML = `
                <div class="treemap-block-label" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>
                <div style="display:flex; align-items:baseline; justify-content:space-between; width:100%;">
                    <span class="treemap-block-pct">${item.percentage.toFixed(0)}%</span>
                    <span class="treemap-block-sub">${item.count} motor${item.count > 1 ? 's' : ''}</span>
                </div>
            `;
            
            block.onclick = () => {
                elements.filterCompanySelect.value = item.name;
                state.filterCompany = item.name;
                renderMainContent();
            };
            
            container.appendChild(block);
        });
    }

    function renderTop10Motors(catMotors) {
        const container = document.getElementById('top-motors-chart-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (catMotors.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:20px; text-align:center; width:100%;">No data to display</div>';
            return;
        }
        
        const sorted = [...catMotors]
            .map(m => ({
                ...m,
                thrustKg: parseThrustToKg(m.thrust)
            }))
            .sort((a, b) => b.thrustKg - a.thrustKg)
            .slice(0, 10);
        
        const maxThrust = sorted[0]?.thrustKg || 1;
        
        sorted.forEach((m, index) => {
            const pct = (m.thrustKg / maxThrust) * 100;
            const row = document.createElement('div');
            row.className = 'bar-row';
            row.innerHTML = `
                <span class="bar-num">#${index + 1}</span>
                <span class="bar-label" title="${escapeHTML(m.motor)}">${escapeHTML(m.motor)}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${pct}%"></div>
                </div>
                <span class="bar-value">${m.thrustKg.toFixed(2)} kg</span>
            `;
            container.appendChild(row);
        });
    }

    function renderInsights(catMotors) {
        const container = document.getElementById('insights-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (catMotors.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:20px; text-align:center; width:100%;">No insights available</div>';
            return;
        }
        
        const escCounts = {};
        let topEsc = '-';
        let maxEscCount = 0;
        catMotors.forEach(m => {
            if (m.esc) {
                escCounts[m.esc] = (escCounts[m.esc] || 0) + 1;
                if (escCounts[m.esc] > maxEscCount) {
                    maxEscCount = escCounts[m.esc];
                    topEsc = m.esc;
                }
            }
        });
        
        const propCounts = {};
        let topProp = '-';
        let maxPropCount = 0;
        catMotors.forEach(m => {
            if (m.prop) {
                propCounts[m.prop] = (propCounts[m.prop] || 0) + 1;
                if (propCounts[m.prop] > maxPropCount) {
                    maxPropCount = propCounts[m.prop];
                    topProp = m.prop;
                }
            }
        });
        let maxThrustVal = 0;
        let maxThrustMotorName = '-';
        catMotors.forEach(m => {
            const thrustVal = parseThrustToKg(m.thrust);
            if (thrustVal > maxThrustVal) {
                maxThrustVal = thrustVal;
                maxThrustMotorName = m.motor;
            }
        });
        
        const insights = [
            { label: 'Popular ESC', val: topEsc, icon: 'zap' },
            { label: 'Standard Propeller', val: topProp, icon: 'wind' },
            { label: 'Max Thrust Leader', val: maxThrustMotorName !== '-' ? `${maxThrustMotorName} (${maxThrustVal.toFixed(1)} kg)` : '-', icon: 'trending-up' }
        ];
        
        insights.forEach(item => {
            const div = document.createElement('div');
            div.className = 'insight-item';
            div.innerHTML = `
                <div class="insight-icon-box">
                    <i data-lucide="${item.icon}"></i>
                </div>
                <div class="insight-info" style="flex:1; min-width:0;">
                    <span class="insight-lbl">${item.label}</span>
                    <span class="insight-desc" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;" title="${escapeHTML(item.val)}">${escapeHTML(item.val)}</span>
                </div>
            `;
            container.appendChild(div);
        });
        
        lucide.createIcons();
    }

    function renderCharts() {
        const cat = state.categories.find(c => c.id === state.activeCategory);
        const catMotors = state.motors.filter(m => m.categoryId === state.activeCategory);
        
        updateKpis(catMotors, cat);
        renderBrandTreemap(catMotors);
        renderTop10Motors(catMotors);
        renderInsights(catMotors);
    }

    // Event Listeners
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        elements.searchClear.style.display = state.searchQuery ? 'block' : 'none';
        state.currentPage = 1;
        renderMainContent();
        showSearchSuggestions(state.searchQuery);
    });

    // =========================================================================
    // SMART SEARCH SUGGESTIONS
    // =========================================================================
    const suggestionsEl = document.getElementById('search-suggestions');
    let activeSuggestionIndex = -1;

    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
            }
        }
        return dp[m][n];
    }

    function scoreMotor(motor, query) {
        const q = query.toLowerCase().trim();
        if (!q) return -1;
        const fields = [motor.motor || '', motor.company || '', motor.esc || '', motor.prop || ''];
        const haystack = fields.join(' ').toLowerCase();
        const motorLower = (motor.motor || '').toLowerCase();
        const companyLower = (motor.company || '').toLowerCase();
        let score = 0;
        if (motorLower.startsWith(q)) score += 100;
        else if (motorLower.includes(q)) score += 70;
        else if (companyLower.includes(q)) score += 50;
        else if (haystack.includes(q)) score += 30;
        const queryTokens = q.split(/\s+/);
        const motorTokens = haystack.split(/\s+/);
        queryTokens.forEach(qt => {
            if (!qt) return;
            motorTokens.forEach(mt => {
                if (mt.startsWith(qt)) score += 20;
                else if (mt.includes(qt)) score += 10;
                else {
                    const maxDist = qt.length > 7 ? 2 : qt.length > 4 ? 1 : 0;
                    const dist = levenshtein(qt, mt.substring(0, qt.length + 2));
                    if (dist <= maxDist) score += Math.max(5, 12 - dist * 4);
                }
            });
        });
        return score;
    }

    function escH(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function highlightMatch(text, query) {
        if (!query || !text) return escH(text || '');
        const escaped = escH(text);
        const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
    }

    function showSearchSuggestions(query) {
        activeSuggestionIndex = -1;
        const q = (query || '').trim();
        if (q.length < 1) { suggestionsEl.style.display = 'none'; return; }

        const scored = state.motors
            .map(m => { const cat = state.categories.find(c => c.id === m.categoryId); return { motor: m, cat, score: scoreMotor(m, q) }; })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        if (scored.length === 0) {
            suggestionsEl.innerHTML = `<div class="suggestion-no-results">No motors match "<strong>${escH(q)}</strong>"</div>`;
            suggestionsEl.style.display = 'block';
            return;
        }

        const items = scored.map((x, idx) => {
            const { motor: m, cat } = x;
            const catName = cat ? cat.name : 'Uncategorized';
            const initials = (m.motor || '?').charAt(0).toUpperCase();
            return `<div class="suggestion-item" data-idx="${idx}" data-motor-id="${escH(m.id)}" data-cat-id="${escH(m.categoryId)}">
                <div class="suggestion-item-icon">${initials}</div>
                <div class="suggestion-item-body">
                    <div class="suggestion-motor-name">${highlightMatch(m.motor, q)}</div>
                    <div class="suggestion-motor-meta">${highlightMatch(m.company, q)}${m.esc ? ' &nbsp;·&nbsp; ESC: ' + escH(m.esc) : ''}</div>
                </div>
                <span class="suggestion-thrust-badge">${escH(catName)}</span>
            </div>`;
        }).join('');

        suggestionsEl.innerHTML = `<div class="suggestion-header">Suggestions &nbsp;·&nbsp; ${scored.length} match${scored.length !== 1 ? 'es' : ''} across all categories</div>${items}`;
        suggestionsEl.style.display = 'block';

        suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const catId = item.dataset.catId;
                const motorName = scored[parseInt(item.dataset.idx)].motor.motor;
                if (catId && catId !== state.activeCategory) {
                    state.activeCategory = catId;
                    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                    const catBtn = document.querySelector(`.category-btn[data-cat-id="${catId}"]`);
                    if (catBtn) catBtn.classList.add('active');
                }
                elements.searchInput.value = motorName;
                state.searchQuery = motorName;
                elements.searchClear.style.display = 'block';
                suggestionsEl.style.display = 'none';
                state.currentPage = 1;
                renderMainContent();
            });
        });
    }

    elements.searchInput.addEventListener('keydown', (e) => {
        const items = suggestionsEl.querySelectorAll('.suggestion-item');
        if (suggestionsEl.style.display === 'none' || items.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, -1); }
        else if (e.key === 'Enter' && activeSuggestionIndex >= 0) { e.preventDefault(); items[activeSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return; }
        else if (e.key === 'Escape') { suggestionsEl.style.display = 'none'; activeSuggestionIndex = -1; return; }
        items.forEach((item, i) => item.classList.toggle('active', i === activeSuggestionIndex));
        if (activeSuggestionIndex >= 0) items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    });

    document.addEventListener('click', (e) => {
        if (!elements.searchInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
            suggestionsEl.style.display = 'none'; activeSuggestionIndex = -1;
        }
    });

    elements.searchInput.addEventListener('focus', () => {
        if (elements.searchInput.value.trim().length >= 1) showSearchSuggestions(elements.searchInput.value);
    });

    elements.searchClear.addEventListener('click', () => {
        state.searchQuery = '';
        elements.searchInput.value = '';
        elements.searchClear.style.display = 'none';
        suggestionsEl.style.display = 'none';
        activeSuggestionIndex = -1;
        state.currentPage = 1;
        renderMainContent();
    });



    elements.filterCompanySelect.addEventListener('change', (e) => {
        state.filterCompany = e.target.value;
        state.currentPage = 1;
        renderMainContent();
    });

    elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        state.currentPage = 1;
        renderMainContent();
    });

    elements.btnClearFilters.addEventListener('click', () => {
        state.searchQuery = '';
        state.filterCompany = 'all';
        state.currentPage = 1;
        elements.searchInput.value = '';
        elements.searchClear.style.display = 'none';
        elements.filterCompanySelect.value = 'all';
        renderMainContent();
    });

    const btnPrevPage = document.getElementById('btn-prev-page');
    if (btnPrevPage) {
        btnPrevPage.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                renderMainContent();
            }
        });
    }

    const btnNextPage = document.getElementById('btn-next-page');
    if (btnNextPage) {
        btnNextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(state.totalFiltered / state.pageSize);
            if (state.currentPage < totalPages) {
                state.currentPage++;
                renderMainContent();
            }
        });
    }

    const paginationLimitSelect = document.getElementById('pagination-limit');
    if (paginationLimitSelect) {
        paginationLimitSelect.addEventListener('change', (e) => {
            state.pageSize = parseInt(e.target.value, 10) || 15;
            state.currentPage = 1;
            renderMainContent();
        });
    }

    if (elements.verificationNotesToggle) {
        elements.verificationNotesToggle.onclick = () => {
            const body = document.getElementById('verification-notes-body');
            const chevron = elements.verificationNotesToggle.querySelector('.notes-chevron');
            if (body && chevron) {
                if (body.style.display === 'none') {
                    body.style.display = 'table-row-group';
                    chevron.style.transform = 'rotate(0deg)';
                } else {
                    body.style.display = 'none';
                    chevron.style.transform = 'rotate(180deg)';
                }
            }
        };
    }

    // Modals
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal-backdrop'));
    });

    // Logout
    

    // Logout and redirect helper
    function logoutAndRedirect(action = 'Logout', details = 'Logged out successfully.') {
        if (session) {
            logUserActivity(session.email, session.role, action, details);
        }
        localStorage.removeItem('thrustvault_session');
        fetch('/api/auth/logout', { method: 'POST' })
            .finally(() => {
                window.location.href = '/login';
            });
    }

    // =========================================================================
    // MOTOR PROFILE & TELEMETRY CHARTS CONTROLLER
    // =========================================================================
    let profileCharts = {
        throttleTime: null,
        rpmTime: null,
        thrustRpm: null,
        torqueRpm: null,
        voltageRpm: null,
        currentRpm: null,
        elecPowerRpm: null,
        mechPowerRpm: null,
        motorEffRpm: null,
        propEffRpm: null,
        systemEffRpm: null
    };

    function destroyProfileCharts() {
        Object.keys(profileCharts).forEach(key => {
            if (profileCharts[key]) {
                profileCharts[key].destroy();
                profileCharts[key] = null;
            }
        });
    }

    // Bind back button
    const backBtn = document.getElementById('btn-profile-back');
    if (backBtn) {
        backBtn.onclick = () => {
            const overlay = document.getElementById('motor-profile-overlay');
            overlay.style.display = 'none';
            destroyProfileCharts();
        };
    }

    // Bind share button
    const shareBtn = document.getElementById('btn-profile-share');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const motorName = document.getElementById('profile-motor-name').textContent;
            const shareUrl = `${window.location.origin}/share/motor/${encodeURIComponent(motorName)}`;
            navigator.clipboard.writeText(shareUrl)
                .then(() => {
                    const originalHTML = shareBtn.innerHTML;
                    shareBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-green-500"></i> Copied!`;
                    if (window.lucide) window.lucide.createIcons();
                    setTimeout(() => {
                        shareBtn.innerHTML = originalHTML;
                        if (window.lucide) window.lucide.createIcons();
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy share link:', err);
                });
        };
    }

    async function showMotorProfile(motorId) {
        const m = state.motors.find(x => x.id === motorId);
        if (!m) return;

        const overlay = document.getElementById('motor-profile-overlay');
        overlay.style.display = 'flex';

        // Load image preview gallery
        const profileImageCard = document.getElementById('profile-image-card');
        const profileMainImage = document.getElementById('profile-main-image');
        const profileGalleryThumbs = document.getElementById('profile-gallery-thumbnails');

        if (profileImageCard && profileMainImage && profileGalleryThumbs) {
            const images = [];
            if (m.mainImage && m.mainImage.startsWith('http')) {
                images.push(m.mainImage);
            }
            
            let gallery = [];
            if (Array.isArray(m.galleryImages)) {
                gallery = m.galleryImages;
            } else if (typeof m.galleryImages === 'string') {
                try {
                    gallery = JSON.parse(m.galleryImages);
                } catch (e) {}
            }
            
            if (Array.isArray(gallery)) {
                gallery.forEach(img => {
                    if (img && img.startsWith('http') && !images.includes(img)) {
                        images.push(img);
                    }
                });
            }

            if (images.length > 0) {
                profileImageCard.style.display = 'flex';
                profileMainImage.src = sanitizeUrl(images[0]);
                profileMainImage.alt = escapeHTML(m.motor);
                
                profileGalleryThumbs.innerHTML = '';
                if (images.length > 1) {
                    profileGalleryThumbs.style.display = 'flex';
                    images.forEach((img, idx) => {
                        const btn = document.createElement('button');
                        btn.className = `w-12 h-12 rounded border-2 transition-all overflow-hidden flex-shrink-0 focus:outline-none ${idx === 0 ? 'border-blue-600 dark:border-blue-500' : 'border-transparent hover:border-slate-350'}`;
                        btn.innerHTML = `<img src="${sanitizeUrl(img)}" class="w-full h-full object-cover">`;
                        btn.onclick = () => {
                            profileMainImage.src = sanitizeUrl(img);
                            // Update border state
                            Array.from(profileGalleryThumbs.children).forEach((c, cIdx) => {
                                if (cIdx === idx) {
                                    c.className = 'w-12 h-12 rounded border-2 transition-all overflow-hidden flex-shrink-0 focus:outline-none border-blue-600 dark:border-blue-500';
                                } else {
                                    c.className = 'w-12 h-12 rounded border-2 transition-all overflow-hidden flex-shrink-0 focus:outline-none border-transparent hover:border-slate-350';
                                }
                            });
                        };
                        profileGalleryThumbs.appendChild(btn);
                    });
                } else {
                    profileGalleryThumbs.style.display = 'none';
                }
            } else {
                profileImageCard.style.display = 'none';
            }
        }

        document.getElementById('profile-motor-name').textContent = m.motor;
        document.getElementById('profile-brand-badge').textContent = m.company;
        
        const cat = state.categories.find(c => c.id === m.categoryId);
        document.getElementById('profile-category-badge').textContent = cat ? `${cat.name} Class` : 'N/A';

        document.getElementById('profile-spec-company').textContent = m.company;
        document.getElementById('profile-spec-thrust').textContent = m.thrust;
        document.getElementById('profile-spec-esc').textContent = m.esc || '-';
        document.getElementById('profile-spec-prop').textContent = m.prop || '-';
        document.getElementById('profile-spec-uploader').textContent = m.uploaded_by || 'System Default';

        // Custom parameters
        const customTableBody = document.getElementById('profile-custom-specs-table');
        customTableBody.innerHTML = '';
        const customCard = document.getElementById('profile-custom-specs-card');
        
        if (state.customSchema && state.customSchema.length > 0) {
            let hasCustomData = false;
            state.customSchema.forEach(field => {
                const val = m.custom_parameters ? m.custom_parameters[field.key] : null;
                if (val !== undefined && val !== null && val !== '') {
                    hasCustomData = true;
                    const tr = document.createElement('tr');
                    const label = field.label;
                    const unit = field.unit ? ` ${field.unit}` : '';
                    tr.innerHTML = `
                        <td>${label}</td>
                        <td>${val}${unit}</td>
                    `;
                    customTableBody.appendChild(tr);
                }
            });
            customCard.style.display = hasCustomData ? 'block' : 'none';
        } else {
            customCard.style.display = 'none';
        }

        // Links
        const linksContainer = document.getElementById('profile-links-container');
        linksContainer.innerHTML = '';
        let hasLinks = false;

        const linkConfigs = [
            { url: m.linkMotor, title: 'Official Motor Specs', icon: 'cpu' },
            { url: m.linkEsc, title: 'Recommended ESC Specs', icon: 'zap' },
            { url: m.linkProp, title: 'Recommended Prop Specs', icon: 'wind' }
        ];

        linkConfigs.forEach(cfg => {
            if (cfg.url) {
                hasLinks = true;
                const a = document.createElement('a');
                a.href = cfg.url;
                a.target = '_blank';
                a.className = 'profile-link-btn';
                a.innerHTML = `
                    <span><i data-lucide="${cfg.icon}"></i> ${cfg.title}</span>
                    <i data-lucide="arrow-up-right" class="arrow-icon"></i>
                `;
                linksContainer.appendChild(a);
            }
        });

        if (!hasLinks) {
            linksContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.88rem; font-style: italic;">No reference links available.</div>';
        }

        // Fetch runs
        const runsList = document.getElementById('profile-test-runs-list');
        runsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:10px;">Loading runs...</div>';

        const telemetryCard = document.getElementById('profile-telemetry-details-card');
        const telemetryEmpty = document.getElementById('profile-telemetry-empty-state');
        telemetryCard.style.display = 'none';
        telemetryEmpty.style.display = 'block';

        document.getElementById('profile-stat-runs').textContent = '0';
        document.getElementById('profile-stat-max-thrust').textContent = '-';
        document.getElementById('profile-stat-avg-eff').textContent = '-';

        destroyProfileCharts();

        try {
            const runsRes = await fetch(`/api/guest/motor-test-runs?motor_id=eq.${motorId}&order=tested_at.desc`);
            if (!runsRes.ok) throw new Error(`Runs fetch failed: HTTP ${runsRes.status}`);
            const runs = await runsRes.json();

            if (!runs || runs.length === 0) {
                runsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:10px; font-style:italic;">No test runs found.</div>';
                lucide.createIcons();
                return;
            }

            const runIds = runs.map(r => r.id);
            const pointsRes = await fetch(`/api/guest/motor-test-data-points?test_run_id=in.(${runIds.join(',')})&order=throttle.asc`);
            if (!pointsRes.ok) throw new Error(`Data points fetch failed: HTTP ${pointsRes.status}`);
            const dataPoints = await pointsRes.json();

            const pointsByRun = {};
            dataPoints.forEach(pt => {
                if (!pointsByRun[pt.test_run_id]) {
                    pointsByRun[pt.test_run_id] = [];
                }
                pointsByRun[pt.test_run_id].push(pt);
            });

            document.getElementById('profile-stat-runs').textContent = runs.length;
            
            let maxThrustVal = 0;
            let sumEff = 0;
            let countEff = 0;

            dataPoints.forEach(pt => {
                const thrustG = parseFloat(pt.thrust_g) || 0;
                if (thrustG > maxThrustVal) maxThrustVal = thrustG;

                const eff = parseFloat(pt.efficiency) || 0;
                if (eff > 0) {
                    sumEff += eff;
                    countEff++;
                }
            });

            document.getElementById('profile-stat-max-thrust').textContent = maxThrustVal > 0 ? `${(maxThrustVal / 1000).toFixed(2)} kg` : '-';
            document.getElementById('profile-stat-avg-eff').textContent = countEff > 0 ? `${(sumEff / countEff).toFixed(2)} g/W` : '-';

            runsList.innerHTML = '';
            runs.forEach((run, index) => {
                const runPts = pointsByRun[run.id] || [];
                const testedDate = new Date(run.tested_at).toLocaleDateString();
                const div = document.createElement('div');
                div.className = `test-run-item ${index === 0 ? 'active' : ''}`;
                div.dataset.id = run.id;
                div.innerHTML = `
                    <div class="test-run-info">
                        <div class="test-run-title">${run.propeller_model} prop / ${run.esc_model || 'No ESC'}</div>
                        <div class="test-run-meta">
                            <span><i data-lucide="zap"></i> ${run.battery_info || 'No Battery'}</span>
                            <span><i data-lucide="calendar"></i> ${testedDate}</span>
                        </div>
                    </div>
                    <div class="test-run-tester">${run.test_conducted_by || 'Unknown'}</div>
                `;

                div.onclick = () => {
                    runsList.querySelectorAll('.test-run-item').forEach(item => item.classList.remove('active'));
                    div.classList.add('active');
                    renderActiveRun(run, runPts);
                };

                runsList.appendChild(div);
            });

            if (runs.length > 0) {
                renderActiveRun(runs[0], pointsByRun[runs[0].id] || []);
            }

        } catch (e) {
            console.error("Error loading profile data:", e);
            runsList.innerHTML = '<div style="color:var(--danger-color); font-size:0.9rem; padding:10px;">Error loading telemetry.</div>';
        }

        lucide.createIcons();
    }

    function renderActiveRun(run, dataPoints) {
        const telemetryCard = document.getElementById('profile-telemetry-details-card');
        const telemetryEmpty = document.getElementById('profile-telemetry-empty-state');
        
        telemetryCard.style.display = 'block';
        telemetryEmpty.style.display = 'none';

        const testedDate = new Date(run.tested_at).toLocaleString();
        document.getElementById('active-run-title').textContent = `Run Telemetry: ${run.propeller_model} Prop / ${run.esc_model || 'No ESC'}`;
        document.getElementById('active-run-meta').textContent = `Conducted by ${run.test_conducted_by || 'Unknown'} on ${testedDate}. Setup: ${run.battery_info || 'Unknown'}.`;

        const tbody = document.getElementById('profile-telemetry-rows');
        tbody.innerHTML = '';
        
        dataPoints.forEach(pt => {
            const tr = document.createElement('tr');
            let throttlePercent = parseFloat(pt.throttle);
            if (throttlePercent <= 1.0) {
                throttlePercent = Math.round(throttlePercent * 100);
            } else {
                throttlePercent = Math.round(throttlePercent);
            }
            
            const eff = parseFloat(pt.efficiency) || 0;
            const temp = parseFloat(pt.temperature);
            const tempStr = (pt.temperature !== null && pt.temperature !== undefined) ? `${temp.toFixed(1)}` : '-';
            
            tr.innerHTML = `
                <td><strong>${throttlePercent}%</strong></td>
                <td>${parseFloat(pt.voltage || 0).toFixed(1)} V</td>
                <td>${parseFloat(pt.current || 0).toFixed(1)} A</td>
                <td>${parseFloat(pt.power || 0).toFixed(0)} W</td>
                <td><strong>${parseFloat(pt.thrust_g || 0).toFixed(0)} g</strong></td>
                <td>${parseFloat(pt.rpm || 0).toFixed(0)}</td>
                <td>${eff > 0 ? eff.toFixed(2) : '-'}</td>
                <td>${tempStr}</td>
            `;
            tbody.appendChild(tr);
        });

        renderTelemetryCharts(dataPoints);
    }

    function createTelemetryScatterChart(canvasId, xLabel, yLabel, dataPointsObj, xKey, yKey, yMin, yMax) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        const chartData = dataPointsObj.map(pt => ({
            x: pt[xKey],
            y: pt[yKey]
        }));

        return new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    data: chartData,
                    backgroundColor: '#f59e0b',
                    borderColor: '#f59e0b',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    showLine: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `X: ${context.parsed.x.toFixed(1)}, Y: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: xLabel,
                            font: { family: 'Inter', size: 9, weight: '500' },
                            color: '#64748b'
                        },
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 8 }, color: '#64748b' }
                    },
                    y: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: yLabel,
                            font: { family: 'Inter', size: 9, weight: '500' },
                            color: '#64748b'
                        },
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 8 }, color: '#64748b' },
                        min: yMin,
                        max: yMax
                    }
                }
            }
        });
    }

    function renderTelemetryCharts(dataPoints) {
        destroyProfileCharts();

        if (!dataPoints || dataPoints.length === 0) return;

        // Process data points
        const processedPoints = dataPoints.map((pt, index) => {
            const throttleVal = parseFloat(pt.throttle) || 0;
            const throttleUs = throttleVal <= 1.0 ? 1000 + throttleVal * 1000 : 1000 + (throttleVal / 100.0) * 1000;
            const timeS = index * 5;
            const rpmVal = parseFloat(pt.rpm) || 0;
            const thrustG = parseFloat(pt.thrust_g) || 0;
            const thrustKgf = thrustG / 1000.0;
            const powerElec = parseFloat(pt.power) || (parseFloat(pt.voltage) * parseFloat(pt.current)) || 0;
            const powerMech = powerElec * 0.82;
            const torqueNm = rpmVal > 0 ? (9.5488 * powerMech) / rpmVal : 0;
            const voltageVal = parseFloat(pt.voltage) || 0;
            const currentVal = parseFloat(pt.current) || 0;
            
            let motorEscEff = 0;
            if (powerElec > 0) {
                const throttlePercent = throttleVal <= 1.0 ? throttleVal : throttleVal / 100.0;
                motorEscEff = 75 + (10 - Math.abs(throttlePercent - 0.7) * 20);
                if (motorEscEff < 60) motorEscEff = 60;
                if (motorEscEff > 85) motorEscEff = 85;
            }
            
            const propEff = parseFloat(pt.efficiency) || (powerElec > 0 ? thrustG / powerElec : 0);
            const systemEff = propEff * 0.85;

            return {
                time: timeS,
                throttleUs: throttleUs,
                rpm: rpmVal,
                thrustKgf: thrustKgf,
                torque: torqueNm,
                voltage: voltageVal,
                current: currentVal,
                powerElec: powerElec,
                powerMech: powerMech,
                motorEscEff: motorEscEff,
                propEff: propEff,
                systemEff: systemEff
            };
        });

        // 1. Throttle vs Time
        profileCharts.throttleTime = createTelemetryScatterChart(
            'profileChartThrottleTime', 'Time (s)', 'Throttle (μs)', 
            processedPoints, 'time', 'throttleUs', 900, 2100
        );

        // 2. Rotation speed vs Time
        profileCharts.rpmTime = createTelemetryScatterChart(
            'profileChartRpmTime', 'Time (s)', 'Rotation speed (rpm)', 
            processedPoints, 'time', 'rpm', 0, undefined
        );

        // 3. Thrust vs Rotation speed
        profileCharts.thrustRpm = createTelemetryScatterChart(
            'profileChartThrustRpm', 'Rotation speed (rpm)', 'Thrust (kgf)', 
            processedPoints, 'rpm', 'thrustKgf', 0, undefined
        );

        // 4. Torque vs Rotation speed
        profileCharts.torqueRpm = createTelemetryScatterChart(
            'profileChartTorqueRpm', 'Rotation speed (rpm)', 'Torque (N·m)', 
            processedPoints, 'rpm', 'torque', 0, undefined
        );

        // 5. Voltage vs Rotation speed
        profileCharts.voltageRpm = createTelemetryScatterChart(
            'profileChartVoltageRpm', 'Rotation speed (rpm)', 'Voltage (V)', 
            processedPoints, 'rpm', 'voltage', 0, undefined
        );

        // 6. Current vs Rotation speed
        profileCharts.currentRpm = createTelemetryScatterChart(
            'profileChartCurrentRpm', 'Rotation speed (rpm)', 'Current (A)', 
            processedPoints, 'rpm', 'current', 0, undefined
        );

        // 7. Electrical power vs Rotation speed
        profileCharts.elecPowerRpm = createTelemetryScatterChart(
            'profileChartElecPowerRpm', 'Rotation speed (rpm)', 'Electrical power (W)', 
            processedPoints, 'rpm', 'powerElec', 0, undefined
        );

        // 8. Mechanical power vs Rotation speed
        profileCharts.mechPowerRpm = createTelemetryScatterChart(
            'profileChartMechPowerRpm', 'Rotation speed (rpm)', 'Mechanical power (W)', 
            processedPoints, 'rpm', 'powerMech', 0, undefined
        );

        // 9. Motor & ESC efficiency
        profileCharts.motorEffRpm = createTelemetryScatterChart(
            'profileChartMotorEffRpm', 'Rotation speed (rpm)', 'Motor & ESC efficiency (%)', 
            processedPoints, 'rpm', 'motorEscEff', 0, 100
        );

        // 10. Propeller efficiency
        profileCharts.propEffRpm = createTelemetryScatterChart(
            'profileChartPropEffRpm', 'Rotation speed (rpm)', 'Propeller efficiency (gf/W)', 
            processedPoints, 'rpm', 'propEff', 0, undefined
        );

        // 11. Propulsion system efficiency
        profileCharts.systemEffRpm = createTelemetryScatterChart(
            'profileChartSystemEffRpm', 'Rotation speed (rpm)', 'Propulsion system efficiency (gf/W)', 
            processedPoints, 'rpm', 'systemEff', 0, undefined
        );
    }

    // Init App
    async function init() {
        try {
            const currentSessionObj = JSON.parse(localStorage.getItem('thrustvault_session') || '{}');
            const userEmail = currentSessionObj.email || 'Anonymous Guest';
            const emailEl = document.getElementById('session-email');
            if (emailEl) emailEl.textContent = userEmail;
            const avatarInit = document.getElementById('user-avatar-initials');
            if (avatarInit) {
                avatarInit.textContent = !currentSessionObj.email ? 'G' : userEmail.charAt(0).toUpperCase();
            }

            await fetchData();
        } catch (e) {
            console.error("Initialization failed", e);
            await logoutAndRedirect();
        }
    }

    // Inactivity Session Expiry (10 minutes)
    let inactivityTimeout;
    let lastSyncTime = Date.now();

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        // inactivityTimeout = setTimeout(autoLogout, 600000); // 10 minutes (disabled)

        // Throttled cookie timestamp sync (at most once every 30 seconds)
        const now = Date.now();
        if (now - lastSyncTime > 30000) {
            lastSyncTime = now;
            const currentSession = JSON.parse(localStorage.getItem('thrustvault_session'));
            if (currentSession) {
                currentSession.timestamp = now;
                localStorage.setItem('thrustvault_session', JSON.stringify(currentSession));
                const cookieValue = encodeURIComponent(JSON.stringify({
                    email: currentSession.email,
                    role: currentSession.role,
                    timestamp: now
                }));
                const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
                document.cookie = `thrustvault_session=${cookieValue}; path=/; max-age=86400; SameSite=Strict${secureFlag}`;
            }
        }
    }

    function autoLogout() {
        alert("You have been logged out due to 10 minutes of inactivity.");
        logoutAndRedirect('Inactivity Logout', 'Logged out due to 10 minutes of inactivity.');
    }

    const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    // Start initial timer
    resetInactivityTimer();

    init();
    

    function setupSidebar() {
        renderSidebar();
    }

    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }
});
