import os
import urllib.request
import urllib.error
import ssl
import time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

TARGET_DIR = os.path.join("frontend", "public", "Reading_Playlist_MP3")
os.makedirs(TARGET_DIR, exist_ok=True)

# Internet Archive에 호스팅된 저작권 만료(Public Domain) 클래식 MP3 직접 링크
BGM_LIST = [
    {
        "filename": "Kevin_MacLeod_-_Relaxing_Piano_Music.mp3",
        "url": "https://archive.org/download/kevin_macleod_relaxing_piano/Kevin_MacLeod_-_Relaxing_Piano_Music.mp3"
    },
    {
        "filename": "Chopin_Nocturne_in_E_flat_major.mp3",
        "url": "https://archive.org/download/ChopinNocturneInEFlatMajorOp.9No.2/Chopin_Nocturne_in_E_flat_major_Op_9_No_2.mp3"
    },
    {
        "filename": "Debussy_Clair_De_Lune.mp3",
        "url": "https://archive.org/download/ClairDeLune_894/Clair_de_lune.mp3"
    }
]

def download_from_archive(url, filepath):
    try:
        print(f"다운로드 중: {os.path.basename(filepath)} ... ", end="", flush=True)
        # Internet Archive는 일반적인 wget 방식의 다운로드를 허용합니다.
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        )
        
        with urllib.request.urlopen(req, context=ctx) as response:
            with open(filepath, 'wb') as out_file:
                while True:
                    data = response.read(16384) # 16KB 씩 읽기
                    if not data:
                        break
                    out_file.write(data)
                    
        file_size = os.path.getsize(filepath)
        print(f"완료! ({file_size // 1024} KB)")
        
    except urllib.error.URLError as e:
        print(f"실패! (네트워크 에러: {e})")
        if os.path.exists(filepath):
            os.remove(filepath)
    except Exception as e:
        print(f"실패! (알 수 없는 에러: {e})")
        if os.path.exists(filepath):
            os.remove(filepath)

print("=== Internet Archive 무료 BGM 다운로드 시작 ===")
for item in BGM_LIST:
    filepath = os.path.join(TARGET_DIR, item["filename"])
    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
        print(f"이미 존재함, 건너뜀: {item['filename']}")
        continue
        
    download_from_archive(item["url"], filepath)
    time.sleep(1) # 서버 부하 방지를 위한 1초 대기

print("\n=== 모든 다운로드 작업 완료 ===")
