#!/bin/bash

# 저장할 디렉토리 생성
OUTPUT_DIR="Reading_Playlist_WAV"
mkdir -p "$OUTPUT_DIR"
echo "📁 '$OUTPUT_DIR' 폴더에 다운로드를 시작합니다..."

# 곡 리스트 (배열)
SONGS=(
    "Erik Satie - Gymnopédie No. 1 No Copyright Audio"
    "Claude Debussy - Clair de Lune No Copyright Audio"
    "Chopin - Nocturne Op. 9 No. 2 No Copyright Audio"
    "Bach - Prelude in C Major No Copyright Audio"
    "Saint-Saëns - The Swan No Copyright Audio"
    "Debussy - Rêverie No Copyright Audio"
    "Beethoven - Moonlight Sonata 1st Movement No Copyright Audio"
    "Pachelbel - Canon in D No Copyright Audio"
    "Vivaldi - Winter Largo No Copyright Audio"
    "Grieg - Morning Mood No Copyright Audio"
    "Purrple Cat - Equinox Royalty Free Lofi"
    "Ghostrifter Official - Morning Routine Royalty Free"
    "Kupla - Sleepy Little One Royalty Free Lofi"
    "lōland - Echoes Royalty Free Lofi"
    "StreamBeats - Chill Vibes Ambient"
    "Hotham - The Point Royalty Free"
    "Sappheiros - Embrace Royalty Free"
    "eugenio izzi - Quiet Time Royalty Free Lofi"
    "Lukrembo - Storybook Royalty Free Lofi"
    "FASSounds - Lofi Study Royalty Free"
)

# 총 곡 수
TOTAL=${#SONGS[@]}
COUNT=1

for SONG in "${SONGS[@]}"; do
    echo "⏳ [$COUNT/$TOTAL] 검색 및 다운로드 중: $SONG"
    yt-dlp "ytsearch1:$SONG" \
        -f "bestaudio/best" \
        --extract-audio \
        --audio-format wav \
        --audio-quality 0 \
        -o "$OUTPUT_DIR/%(title)s.%(ext)s" \
        --no-playlist \
        --quiet \
        --no-warnings
    
    if [ $? -eq 0 ]; then
        echo "✅ 완료"
    else
        echo "❌ 다운로드 실패"
    fi
    COUNT=$((COUNT + 1))
done

echo "🎉 모든 다운로드 및 .wav 변환이 완료되었습니다!"
