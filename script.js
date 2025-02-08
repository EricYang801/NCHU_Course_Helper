class CourseHelper {
    constructor() {
        this.courses = [];
        this.selectedCourses = new Set();
        this.cacheKey = 'courseData';
        this.cacheExpiry = 60 * 60 * 1000; // 1小時
        this.isLoading = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.searchDebounceTimer = null;
        this.searchIndex = new Map();
        this.init();
    }

    showLoading() {
        const overlay = document.getElementById('loading');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loading');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }

    showError(message, duration = 5000) {
        const errorDiv = document.getElementById('error-message');
        if (errorDiv) {
            const errorText = errorDiv.querySelector('p');
            if (errorText) {
                errorText.textContent = message;
            }
            errorDiv.classList.remove('hidden');
            errorDiv.setAttribute('aria-hidden', 'false');

            const closeBtn = errorDiv.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    errorDiv.classList.add('hidden');
                    errorDiv.setAttribute('aria-hidden', 'true');
                };
            }

            if (duration > 0) {
                setTimeout(() => {
                    errorDiv.classList.add('hidden');
                    errorDiv.setAttribute('aria-hidden', 'true');
                }, duration);
            }
        }
    }

    async init() {
        try {
            this.showLoading();
            await this.fetchCourses();
            await this.buildSearchIndex();
            this.loadSelectedCourses();
            this.setupEventListeners();
            this.renderCourses();
            this.setupAdvancedSearch();
        } catch (error) {
            console.error('初始化失敗:', error);
            this.showError('系統初始化失敗，請重新整理頁面');
        } finally {
            this.hideLoading();
        }
    }

    async buildSearchIndex() {
        this.searchIndex = new Map();
        this.courses.forEach((course, index) => {
            const searchText = [
                course.title_parsed?.zh_TW,
                course.title_parsed?.en_US,
                course.title,
                course.professor,
                course.for_dept,
                course.code
            ].filter(text => text).join(' ').toLowerCase();
            this.searchIndex.set(index, searchText);
        });
    }

    async fetchCourses() {
        try {
            const response = await fetch('https://raw.githubusercontent.com/EricYang801/NCHU_Course_Helper/refs/heads/main/data/courses.json');
            if (!response.ok) {
                throw new Error('無法載入課程資料');
            }
            const data = await response.json();
            if (!data || !data.course || !Array.isArray(data.course)) {
                throw new Error('課程數據格式錯誤');
            }
            this.courses = data.course;
        } catch (error) {
            this.showError('載入課程資料失敗，請重新整理頁面');
            this.courses = [];
            throw error;
        }
    }

    getCache() {
        const cached = localStorage.getItem(this.cacheKey);
        if (!cached) return null;

        try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > this.cacheExpiry) {
                localStorage.removeItem(this.cacheKey);
                return null;
            }
            return data;
        } catch {
            return null;
        }
    }

    setCache(data) {
        const cache = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(this.cacheKey, JSON.stringify(cache));
    }

    setupEventListeners() {
        const searchInput = document.querySelector('.search-section input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                if (this.searchDebounceTimer) {
                    clearTimeout(this.searchDebounceTimer);
                }
                this.searchDebounceTimer = setTimeout(() => {
                    // 取得目前的進階篩選條件
                    const filters = {
                        dept: document.getElementById('dept').value,
                        type: document.getElementById('type').value,
                        credits: document.getElementById('credits').value,
                        language: document.getElementById('language').value,
                        grade: document.getElementById('grade').value,
                        keywords: e.target.value.toLowerCase().trim() // 將關鍵字加入篩選條件
                    };
                    // 使用進階篩選方法
                    this.advancedFilterCourses(filters);
                }, 300);
            });
        }

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                e.target.classList.add('active');
                e.target.setAttribute('aria-pressed', 'true');

                const btnText = e.target.textContent;
                switch (btnText) {
                    case '所有課程':
                        this.renderCourses(this.courses);
                        break;
                    case '學期必修':
                        const requiredCourses = this.courses.filter(course => 
                            course.obligatory === '必修'
                        );
                        this.renderCourses(requiredCourses);
                        break;
                    case '已選課表':
                        const selectedCourses = this.courses.filter(course => 
                            this.selectedCourses.has(`${course.code}-${course.class}`)
                        );
                        this.renderCourses(selectedCourses);
                        document.body.classList.add('selected-courses-view');
                        break;
                }
            });
        });

        const closeBtn = document.querySelector('.error-message .close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const errorDiv = document.getElementById('error-message');
                if (errorDiv) {
                    errorDiv.classList.add('hidden');
                    errorDiv.setAttribute('aria-hidden', 'true');
                }
            });
        }

        // 添加全選功能
        const selectAllCheckbox = document.getElementById('selectAll');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll('#courseTableBody input[type="checkbox"]');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = e.target.checked;
                    const courseId = checkbox.dataset.courseId;
                    const [code, classNum] = courseId.split('-');
                    this.handleCourseSelection({ target: checkbox }, { code, class: classNum });
                });
            });
        }
    }

    filterCourses(searchText) {
        if (!searchText.trim()) {
            this.renderCourses();
            return;
        }

        const keyword = searchText.toLowerCase();
        const filtered = this.courses.filter((course, index) => {
            const searchableText = this.searchIndex.get(index);
            return searchableText.includes(keyword);
        });

        this.renderCourses(filtered);
    }

    renderCourses(coursesToShow = this.courses) {
        const tbody = document.querySelector('#courseTableBody');
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';
        
        if (!Array.isArray(coursesToShow) || coursesToShow.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="11" class="text-center">沒有找到任何課程</td>';
            tbody.appendChild(tr);
            return;
        }

        const fragment = document.createDocumentFragment();

        coursesToShow.forEach(course => {
            const row = document.createElement('tr');
            const courseId = `${course.code}-${course.class}`;
            const isSelected = this.selectedCourses.has(courseId);

            row.className = isSelected ? 'selected-course' : '';
            row.innerHTML = `
                <td>
                    <input type="checkbox" 
                           data-course-id="${courseId}"
                           ${isSelected ? 'checked' : ''}
                           aria-label="選擇 ${course.title_parsed?.zh_TW || course.title}">
                </td>
                <td>${course.code}</td>
                <td>${course.title_parsed?.zh_TW || course.title}</td>
                <td>${this.formatTime(course)}</td>
                <td>${course.for_dept || ''}</td>
                <td>${course.obligatory || ''}</td>
                <td>${course.credits || ''}</td>
                <td>${course.language || ''}</td>
                <td>${course.class || ''}</td>
                <td>${course.professor || ''}</td>
                <td>${this.formatNote(course)}</td>
            `;

            // 添加課程選擇的事件監聽
            const checkbox = row.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                const courseId = e.target.dataset.courseId;
                const [code, classNum] = courseId.split('-');
                this.handleCourseSelection(e, { code, class: classNum });
            });

            fragment.appendChild(row);
        });

        tbody.appendChild(fragment);
        
        this.updateSummary();
        this.renderSchedule();
    }

    formatTime(course) {
        if (course.time_parsed && Array.isArray(course.time_parsed)) {
            return course.time_parsed.map(t => {
                if (t && typeof t.day === 'number' && Array.isArray(t.time)) {
                    const dayMap = ['日', '一', '二', '三', '四', '五', '六'];
                    return `${dayMap[t.day]}${t.time.join(',')}`;
                }
                return '';
            }).filter(t => t).join('、') || course.time || '';
        }
        return course.time || '';
    }

    formatNote(course) {
        if (!course) return '';
        
        const notes = [];
        if (Array.isArray(course.location) && course.location.length > 0) {
            notes.push(`地點：${course.location.join('、')}`);
        }
        if (course.note) {
            notes.push(course.note);
        }
        if (Array.isArray(course.intern_location) && course.intern_location.length > 0) {
            notes.push(`實習地點：${course.intern_location.join('、')}`);
        }
        if (course.intern_time) {
            notes.push(`實習時間：${course.intern_time}`);
        }
        return notes.join(' | ');
    }

    handleCourseSelection(event, course) {
        const courseId = `${course.code}-${course.class}`;
        if (event.target.checked) {
            this.selectedCourses.add(courseId);
        } else {
            this.selectedCourses.delete(courseId);
        }
        
        // 更新 UI
        const row = event.target.closest('tr');
        if (row) {
            row.className = event.target.checked ? 'selected-course' : '';
        }

        // 保存選課狀態
        this.saveSelectedCourses();
        
        // 更新摘要和課表
        this.updateSummary();
        this.renderSchedule();
    }

    updateSummary() {
        const selectedCourses = this.courses.filter(course => 
            this.selectedCourses.has(`${course.code}-${course.class}`)
        );
        
        const totalCredits = selectedCourses.reduce((sum, course) => 
            sum + (parseFloat(course.credits) || 0), 0
        );
        
        const creditsSpan = document.querySelector('.credits');
        if (creditsSpan) {
            creditsSpan.textContent = `${totalCredits} 學分`;
        }
        
        // 計算總時數
        const totalHours = selectedCourses.reduce((sum, course) => {
            if (course.time_parsed && Array.isArray(course.time_parsed)) {
                return sum + course.time_parsed.reduce((timeSum, t) => 
                    timeSum + (Array.isArray(t.time) ? t.time.length : 0), 0
                );
            }
            return sum;
        }, 0);
        
        const hoursSpan = document.querySelector('.hours');
        if (hoursSpan) {
            hoursSpan.textContent = `${totalHours} 小時`;
        }
    }

    saveSelectedCourses() {
        localStorage.setItem('selectedCourses', JSON.stringify(Array.from(this.selectedCourses)));
    }

    loadSelectedCourses() {
        try {
            const saved = localStorage.getItem('selectedCourses');
            if (saved) {
                const selectedArray = JSON.parse(saved);
                this.selectedCourses = new Set(selectedArray);
                this.renderSchedule(); // 載入選課後立即渲染課表
            }
        } catch (error) {
            console.error('載入已選課程失敗:', error);
            this.selectedCourses = new Set();
        }
    }

    renderSchedule() {
        const tbody = document.querySelector('#scheduleTableBody');
        if (!tbody) {
            console.error('找不到課表 tbody 元素');
            return;
        }

        // 清空現有課表
        tbody.innerHTML = '';

        // 創建課表時段 (1-13節)
        const periods = Array.from({ length: 13 }, (_, i) => i + 1);
        const days = [1, 2, 3, 4, 5]; // 週一到週五

        // 創建課表格子的映射
        const scheduleMap = new Map();
        days.forEach(day => {
            scheduleMap.set(day, new Map());
        });

        // 填入已選課程
        const selectedCourses = this.courses.filter(course => 
            this.selectedCourses.has(`${course.code}-${course.class}`)
        );

        console.log('已選課程:', selectedCourses); // 調試用

        selectedCourses.forEach(course => {
            if (course.time_parsed && Array.isArray(course.time_parsed)) {
                course.time_parsed.forEach(t => {
                    if (t && typeof t.day === 'number' && Array.isArray(t.time)) {
                        t.time.forEach(period => {
                            if (!scheduleMap.has(t.day)) return;
                            
                            // 檢查是否已有課程在此時段
                            if (scheduleMap.get(t.day).has(period)) {
                                const existingCourse = scheduleMap.get(t.day).get(period);
                                scheduleMap.get(t.day).set(period, {
                                    ...course,
                                    conflict: true,
                                    conflictWith: existingCourse
                                });
                            } else {
                                scheduleMap.get(t.day).set(period, course);
                            }
                        });
                    }
                });
            }
        });

        // 渲染課表
        periods.forEach(period => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${period}</td>`;

            days.forEach(day => {
                const course = scheduleMap.get(day).get(period);
                if (course) {
                    const title = course.title_parsed?.zh_TW || course.title;
                    const cellClass = course.conflict ? 'has-course conflict' : 'has-course';
                    
                    row.innerHTML += `
                        <td class="${cellClass}" title="${title}${course.conflict ? ' (衝堂)' : ''}">
                            <div class="course-cell">
                                <span class="course-name">${title}</span>
                                <small class="course-info">${course.professor || ''}</small>
                            </div>
                        </td>
                    `;
                } else {
                    row.innerHTML += '<td></td>';
                }
            });

            tbody.appendChild(row);
        });

        console.log('課表渲染完成'); // 調試用
    }

    setupAdvancedSearch() {
        const toggle = document.querySelector('.advanced-search-toggle');
        const panel = document.querySelector('.advanced-search-panel');
        const searchBtn = panel.querySelector('.search-btn');
        const resetBtn = panel.querySelector('.reset-btn');
        const searchInput = document.querySelector('.search-wrapper input');
        
        // 切換面板顯示
        toggle.addEventListener('click', () => {
            panel.classList.toggle('show');
        });
        
        // 點擊外部關閉面板
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && !toggle.contains(e.target)) {
                panel.classList.remove('show');
            }
        });
        
        // 搜尋按鈕點擊
        searchBtn.addEventListener('click', () => {
            const searchInput = document.querySelector('.search-wrapper input');
            const filters = {
                dept: document.getElementById('dept').value,
                type: document.getElementById('type').value,
                credits: document.getElementById('credits').value,
                language: document.getElementById('language').value,
                grade: document.getElementById('grade').value,
                keywords: searchInput ? searchInput.value.toLowerCase().trim() : '' // 加入搜尋列的關鍵字
            };
            
            this.advancedFilterCourses(filters);
            panel.classList.remove('show');
        });
        
        // 重置按鈕點擊
        resetBtn.addEventListener('click', () => {
            // 重置所有篩選選項
            document.getElementById('dept').value = '';
            document.getElementById('type').value = '';
            document.getElementById('credits').value = '';
            document.getElementById('language').value = '';
            document.getElementById('grade').value = '';
            
            // 重置搜尋框
            if (searchInput) {
                searchInput.value = '';
            }
            
            // 重新渲染所有課程
            this.renderCourses(this.courses);
            
            // 關閉進階搜尋面板
            panel.classList.remove('show');
        });
        
        // 初始化系所選項
        this.initDepartmentOptions();
    }

    initDepartmentOptions() {
        const depts = new Set();
        this.courses.forEach(course => {
            if (course.for_dept) {
                depts.add(course.for_dept);
            }
        });
        
        const deptSelect = document.getElementById('dept');
        Array.from(depts).sort().forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            deptSelect.appendChild(option);
        });
    }

    advancedFilterCourses(filters) {
        const keyword = filters.keywords ? filters.keywords.toLowerCase() : '';

        const filtered = this.courses.filter((course, index) => {
            if (keyword) {
                const searchableText = this.searchIndex.get(index);
                if (!searchableText.includes(keyword)) {
                    return false;
                }
            }

            if (filters.dept && course.for_dept !== filters.dept) {
                return false;
            }
            
            if (filters.type && course.obligatory !== filters.type) {
                return false;
            }
            
            if (filters.credits) {
                const courseCredits = parseInt(course.credits);
                const filterCredits = parseInt(filters.credits);
                if (courseCredits !== filterCredits) {
                    return false;
                }
            }
            
            if (filters.language && course.language !== filters.language) {
                return false;
            }
            
            if (filters.grade) {
                if (!course.class || !course.class.startsWith(filters.grade)) {
                    return false;
                }
            }
            
            return true;
        });
        
        this.renderCourses(filtered);
    }

    toggleCourseSelection(courseCode, courseClass) {
        const key = `${courseCode}-${courseClass}`;
        if (this.selectedCourses.has(key)) {
            this.selectedCourses.delete(key);
        } else {
            this.selectedCourses.add(key);
        }
        
        // 保存選課狀態
        localStorage.setItem('selectedCourses', 
            JSON.stringify(Array.from(this.selectedCourses))
        );
        
        // 更新課表顯示
        this.renderSchedule();
    }
}

// 初始化應用
document.addEventListener('DOMContentLoaded', () => {
    window.courseHelper = new CourseHelper();
}); 