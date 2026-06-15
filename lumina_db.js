const LuminaDB = (function() {
    const initialMockData = [
        { id: 1, title: "Neon Cyber City", category: "Technology", device: "Desktop", author: "Alex Chen", res: "3840x2160", size: "3.8 MB", url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80", fullUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=2000&q=100", tags: ["cyberpunk", "city", "neon", "dark"], colors: ["#0f172a", "#8b5cf6", "#ec4899"], timestamp: Date.now() },
        { id: 2, title: "Deep Space Nebula", category: "Space", device: "Desktop", author: "NASA", res: "5120x2880", size: "8.1 MB", url: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80", fullUrl: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2000&q=100", tags: ["stars", "galaxy", "purple", "cosmos"], colors: ["#000000", "#4c1d95", "#1e3a8a"], timestamp: Date.now()-1000 },
        { id: 3, title: "Minimalist Geometry", category: "Minimal", device: "Mobile", author: "Sarah Lee", res: "1440x3200", size: "1.2 MB", url: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=600&h=1200&q=80", fullUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1440&h=3200&q=100", tags: ["abstract", "shapes", "clean", "white"], colors: ["#ffffff", "#e2e8f0", "#94a3b8"], timestamp: Date.now()-2000 },
        { id: 4, title: "Misty Mountain Peaks", category: "Nature", device: "Desktop", author: "David Gu", res: "2560x1440", size: "2.5 MB", url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80", fullUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2000&q=100", tags: ["mountains", "fog", "landscape", "cold"], colors: ["#475569", "#cbd5e1", "#f8fafc"], timestamp: Date.now()-3000 }
    ];

    let cachedData = null;

    function getCredentials() {
        const token = localStorage.getItem('lumina_gh_token');
        const repoPath = localStorage.getItem('lumina_gh_repo'); // format: username/repo
        return { token, repoPath };
    }

    async function githubFetch(url, options = {}) {
        const { token } = getCredentials();
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        };
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }
        
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            if (response.status === 404) return null; // File not found
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`GitHub API Error: ${response.status} ${errorData.message || response.statusText}`);
        }
        return response.json();
    }

    // Convert string to base64 safely (handles unicode)
    function encodeBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }
    
    // Convert base64 to string safely
    function decodeBase64(str) {
        return decodeURIComponent(escape(atob(str)));
    }

    // Convert file to base64 string
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // remove the data:image/jpeg;base64, prefix for github
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    async function init() {
        // We don't need a formal initialization for GitHub unless we want to ensure database.json exists.
        // We will just do a check in getAllWallpapers.
        return true;
    }

    async function getDatabaseSha() {
        const { repoPath } = getCredentials();
        if (!repoPath) throw new Error("GitHub repository not configured.");
        const data = await githubFetch(`https://api.github.com/repos/${repoPath}/contents/database.json`);
        return data ? data.sha : null;
    }

    async function getAllWallpapers() {
        // Try fetching from local relative path first (faster, public)
        try {
            const response = await fetch('database.json?t=' + Date.now()); // cache bust
            if (response.ok) {
                const data = await response.json();
                cachedData = data;
                return data;
            }
        } catch (e) {
            // Ignore fetch errors (e.g. CORS if opened via file://)
        }

        // If that fails, fallback to GitHub API if credentials exist
        const { repoPath } = getCredentials();
        if (repoPath) {
            const fileData = await githubFetch(`https://api.github.com/repos/${repoPath}/contents/database.json`);
            if (fileData && fileData.content) {
                try {
                    const data = JSON.parse(decodeBase64(fileData.content.replace(/\n/g, '')));
                    cachedData = data;
                    return data;
                } catch(e) {
                    console.error("Error parsing database.json", e);
                }
            }
        }

        // Fallback to mock data if no database.json exists anywhere
        cachedData = [...initialMockData];
        return cachedData;
    }

    async function saveDatabase(data) {
        const { repoPath } = getCredentials();
        if (!repoPath) throw new Error("GitHub repository not configured. Please login.");

        const sha = await getDatabaseSha();
        const contentBase64 = encodeBase64(JSON.stringify(data, null, 2));

        const body = {
            message: "Update database.json via Lumina Admin",
            content: contentBase64,
        };
        if (sha) body.sha = sha;

        await githubFetch(`https://api.github.com/repos/${repoPath}/contents/database.json`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        cachedData = data;
    }

    async function uploadImageToGitHub(filename, base64Content) {
        const { repoPath } = getCredentials();
        if (!repoPath) throw new Error("GitHub repository not configured.");

        const path = `images/${filename}`;
        
        // We skip checking for sha assuming the filename is unique (timestamp based)
        const body = {
            message: `Upload image ${filename}`,
            content: base64Content,
        };

        const result = await githubFetch(`https://api.github.com/repos/${repoPath}/contents/${path}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        
        // Return the raw URL for public viewing
        // Format: https://raw.githubusercontent.com/username/repo/main/images/filename
        return result.content.download_url; 
    }

    async function deleteFileFromGitHub(url) {
        try {
            const { repoPath } = getCredentials();
            if (!repoPath) return;

            // Extract path from download_url (e.g. images/12345.jpg)
            // https://raw.githubusercontent.com/username/repo/main/images/12345.jpg
            const match = url.match(new RegExp(`${repoPath}/[^/]+/(images/.*)`));
            if (!match) return;
            const path = match[1];

            // Get file SHA
            const fileData = await githubFetch(`https://api.github.com/repos/${repoPath}/contents/${path}`);
            if (!fileData || !fileData.sha) return;

            // Delete file
            await githubFetch(`https://api.github.com/repos/${repoPath}/contents/${path}`, {
                method: 'DELETE',
                body: JSON.stringify({
                    message: `Delete image ${path}`,
                    sha: fileData.sha
                })
            });
        } catch (e) {
            console.error("Failed to delete image file from GitHub:", e);
        }
    }

    async function addWallpaper(item) {
        item.id = Date.now();
        item.timestamp = Date.now();
        
        let data = cachedData || await getAllWallpapers();

        // 1. Upload the Full Image to GitHub (if present)
        if (item.fullBlob) {
            const ext = item.fullBlob.name.split('.').pop() || 'jpg';
            const filename = `full_${item.id}.${ext}`;
            const base64 = await fileToBase64(item.fullBlob);
            item.fullUrl = await uploadImageToGitHub(filename, base64);
            delete item.fullBlob; // remove blob before saving to JSON
        }

        // 2. Upload the Thumbnail to GitHub (compressedBase64)
        if (item.url && item.url.startsWith('data:image')) {
            const base64 = item.url.split(',')[1];
            const filename = `thumb_${item.id}.jpg`;
            item.url = await uploadImageToGitHub(filename, base64);
        }

        // 3. Update database.json
        data.unshift(item);
        await saveDatabase(data);
        return item;
    }

    async function deleteWallpaper(id) {
        let data = cachedData || await getAllWallpapers();
        const itemIndex = data.findIndex(i => i.id === id);
        if (itemIndex === -1) return;
        
        const item = data[itemIndex];

        // 1. Delete image files from GitHub
        if (item.url && item.url.includes('githubusercontent')) {
            await deleteFileFromGitHub(item.url);
        }
        if (item.fullUrl && item.fullUrl.includes('githubusercontent')) {
            await deleteFileFromGitHub(item.fullUrl);
        }

        // 2. Remove from database and save
        data.splice(itemIndex, 1);
        await saveDatabase(data);
    }

    // Compresses a File object into a base64 string
    function compressImage(file, maxWidth = 600, quality = 0.6) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    
                    resolve({
                        compressedBase64,
                        res: `${img.width}x${img.height}`,
                        device: img.width >= img.height ? 'Desktop' : 'Mobile'
                    });
                };
                img.onerror = error => reject(error);
            };
            reader.onerror = error => reject(error);
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function isAuthenticated() {
        const { token, repoPath } = getCredentials();
        return !!(token && repoPath);
    }

    return {
        init,
        getAllWallpapers,
        addWallpaper,
        deleteWallpaper,
        compressImage,
        formatBytes,
        isAuthenticated
    };
})();
