// sdxl-lightning-test.js - SDXL Lightning 모델 테스트
// bytedance/sdxl-lightning-4step 모델 사용

const { rateLimiter } = require('./services/rateLimiter.js');

async function testSDXLLightning(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, prompt } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['image', 'prompt'] 
      });
    }

    console.log('\n========================================');
    console.log('🚀 SDXL LIGHTNING TEST');
    console.log('========================================');
    console.log('📝 Prompt:', prompt.substring(0, 100) + '...');
    
    // SDXL Lightning API 호출
    const result = await rateLimiter.addToQueue(async () => {
      const response = await fetch(
        'https://api.replicate.com/v1/models/bytedance/sdxl-lightning-4step/predictions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${process.env.REPLICATE_API_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'
          },
          body: JSON.stringify({
            input: {
              prompt: prompt,
              image: image,  // 입력 이미지
              num_inference_steps: 4,  // Lightning은 4 steps!
              guidance_scale: 0,  // Lightning은 guidance 0
              scheduler: "K_EULER",
              num_outputs: 1,
              disable_safety_checker: false,
              output_format: "jpg",
              output_quality: 90
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('SDXL Lightning error:', response.status, errorText);
        
        if (response.status === 429) {
          const errorData = JSON.parse(errorText);
          const error = new Error(errorData.detail || 'Rate limited');
          error.status = 429;
          error.retry_after = errorData.retry_after || 10;
          throw error;
        }
        
        throw new Error(`SDXL API error: ${response.status}`);
      }

      return await response.json();
    });

    console.log('✅ SDXL Lightning completed');
    console.log('💰 Cost: ~$0.011 (vs FLUX: $0.04)');
    console.log('⚡ Speed: ~2 seconds (vs FLUX: ~5 seconds)');
    
    res.status(200).json({
      ...result,
      model: 'sdxl-lightning-4step',
      cost: 0.011,
      comparison: {
        flux_cost: 0.04,
        savings: '72.5%',
        speed_improvement: '2.5x'
      }
    });
    
  } catch (error) {
    console.error('❌ Handler error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = testSDXLLightning;
