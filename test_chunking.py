# Test chunking locally - FIXED VERSION
def chunk_text(text, chunk_size=1000, chunk_overlap=200):
    chunks = []
    start = 0
    chunk_index = 0
    text_len = len(text)
    
    # Ensure chunk_overlap is smaller than chunk_size
    chunk_overlap = min(chunk_overlap, chunk_size // 2)
    
    while start < text_len:
        end = min(start + chunk_size, text_len)
        
        # Try to break at sentence/paragraph boundary
        if end < text_len:
            search_start = max(start, end - int(chunk_size * 0.2))
            best_break = end
            
            # Priority: paragraph > sentence > word
            for sep in ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']:
                pos = text.rfind(sep, search_start, end)
                if pos != -1:
                    best_break = pos + len(sep)
                    break
            
            end = best_break
        
        chunk_content = text[start:end].strip()
        if chunk_content:
            chunks.append({
                'chunk_index': chunk_index,
                'content': chunk_content,
                'start_char': start,
                'end_char': end,
            })
            chunk_index += 1
        
        # Move start forward: advance by (chunk_size - overlap) but at least 1
        step = max(chunk_size - chunk_overlap, 1)
        new_start = start + step
        
        # If we didn't advance past 'end', force progress
        if new_start <= start:
            new_start = end
        
        start = new_start
    
    return chunks

# Test with sample text
test_text = '''Три человека. Три комнаты. Три финала. И один вопрос: сколько «я» может быть у одного человека, прежде чем он перестанет быть человеком?
Утро.
ГЛАВА 1
Он проснулся. И это было первое, с чего всё началось. Простая, почти примитивная мысль: я существую.
Глаза открылись, но сознание отставало, выплывая из липкой, безвременной пустоты, где не было ни «я», ни мира, ни навязчивого, давящего чувства, что что-то не так. Потолок был белым. Идеально белым, без единой трещинки, без пятен.'''

chunks = chunk_text(test_text)
print(f'Total chunks: {len(chunks)}')
for i, c in enumerate(chunks):
    content = c["content"]
    print(f'Chunk {i}: {len(content)} chars - {repr(content[:80])}...')
