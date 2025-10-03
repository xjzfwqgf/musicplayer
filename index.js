const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const mm = require('music-metadata');

const app = express();
const PORT = process.env.PORT || 3000;
const MUSIC_DIR = process.env.MUSIC_DIR || './jays';
// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // 添加静态文件服务

// 工具函数：读取单个文件的元数据
async function readMusicMetadata(filePath) {
  try {
    const metadata = await mm.parseFile(filePath);
    
    return {
      success: true,
      data: {
        title: metadata.common.title || path.parse(filePath).name,
        artist: metadata.common.artist || '未知艺术家',
        album: metadata.common.album || '未知专辑',
        year: metadata.common.year,
        track: metadata.common.track ? {
          no: metadata.common.track.no,
          of: metadata.common.track.of
        } : null,
        genre: metadata.common.genre || [],
        duration: metadata.format.duration ? Math.round(metadata.format.duration) : 0,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        codec: metadata.format.codec,
        container: metadata.format.container
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `读取文件元数据失败: ${error.message}`
    };
  }
}

// 工具函数：批量读取目录中的音乐文件
async function batchReadMetadata(directoryPath) {
  try {
    // 检查目录是否存在
    await fs.access(directoryPath);
    
    const files = await fs.readdir(directoryPath);
    const musicFiles = files.filter(file => 
      ['.mp3', '.flac', '.m4a', '.wav', '.aac', '.ogg', '.wma'].includes(
        path.extname(file).toLowerCase()
      )
    );
    
    const results = [];
    
    for (const file of musicFiles) {
      const filePath = path.join(directoryPath, file);
      const metadata = await readMusicMetadata(filePath);
      
      if (metadata.success) {
        results.push({
          filename: file,
          //filepath: filePath,
          ...metadata.data
        });
      } else {
        results.push({
          filename: file,
          filepath: filePath,
          error: metadata.error,
          title: path.parse(file).name,
          artist: '未知',
          album: '未知',
          duration: 0
        });
      }
    }
    
    return {
      success: true,
      count: results.length,
      directory: directoryPath,
      files: results
    };
  } catch (error) {
    return {
      success: false,
      error: `访问目录失败: ${error.message}`
    };
  }
}

// API 路由
// 获取音乐列表
app.get('/api/music', async (req, res) => {
  try {
    const result = await batchReadMetadata(MUSIC_DIR);
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `服务器错误: ${error.message}`
    });
  }
});

// 获取单个音乐文件
app.get('/api/music/:filename', async (req, res) => {
  try {
    const filePath = path.join(MUSIC_DIR, req.params.filename);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: '文件不存在'
      });
    }
    
    // 读取文件元数据
    const metadata = await readMusicMetadata(filePath);
    
    if (metadata.success) {
      res.json({
        success: true,
        filename: req.params.filename,
        ...metadata.data
      });
    } else {
      res.status(500).json(metadata);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `服务器错误: ${error.message}`
    });
  }
});

// 流式传输音乐文件
app.get('/api/stream/:filename', async (req, res) => {
  try {
    const filePath = path.join(MUSIC_DIR, req.params.filename);
    
    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: '文件不存在'
      });
    }
    
    // 获取文件信息
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      // 处理范围请求
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      
      const file = fs.createReadStream(filePath, { start, end });
      const headers = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/mpeg', // 可以根据文件类型动态设置
      };
      
      res.writeHead(206, headers);
      file.pipe(res);
    } else {
      // 整个文件
      const headers = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg', // 可以根据文件类型动态设置
      };
      
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `服务器错误: ${error.message}`
    });
  }
});

// 提供静态HTML页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web_demo.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`音乐目录: ${MUSIC_DIR}`);
});