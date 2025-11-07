# Thinking Mode Support Fix for Gemini Models

## Issue Fixed
Previously, when reasoning/thinking mode was enabled in the UI, it was being sent to ALL Gemini models including Gemini 2.0, which caused API Error 400:
```
Unable to submit request because thinking is not supported by this model.
```

## Solution
Added model version checking in `gemini_provider.py` to restrict thinking mode only to supported models:

### Code Change
```python
# Check if this model supports thinking/reasoning mode (only Gemini 2.5+ models)
model_supports_thinking = model.startswith("gemini-2.5") or "2.5" in model

# Only inject thinking config for supported models
if (params.thinking_budget is not None or params.include_thoughts) and model_supports_thinking:
    # Inject thinkingConfig
    thinking_cfg = {...}
    payload["generationConfig"]["thinkingConfig"] = thinking_cfg
elif (params.thinking_budget is not None or params.include_thoughts) and not model_supports_thinking:
    # Display warning for unsupported models
    yield ChatResponse(
        content=" (Note: Reasoning mode is only supported by Gemini 2.5+ models, proceeding with standard generation)",
        # ... warning response
    )
```

## Models Affected
- **Gemini 2.5 Pro** ✅ - Supports thinking mode
- **Gemini 2.5 Flash** ✅ - Supports thinking mode  
- **Gemini 2.5 Flash-Lite** ✅ - Supports thinking mode
- **Gemini 2.0 Flash** ❌ - Does NOT support thinking mode (shows warning)

## Testing Results
### Before Fix:
- Gemini 2.0 Flash with thinking mode → API Error 400
- Chat would fail completely

### After Fix:
- Gemini 2.0 Flash with thinking mode → Warning message + proceeds with standard generation
- Gemini 2.5 Flash with thinking mode → Works perfectly with reasoning
- No API errors, graceful degradation

## Log Evidence
```
# Gemini 2.0 - Warning displayed, no thinkingConfig sent
[Gemini] Thinking mode requested but not supported by gemini-2.0-flash. Only Gemini 2.5+ models support reasoning mode.
genKeys=['temperature', 'maxOutputTokens', 'topP']

# Gemini 2.5 - ThinkingConfig successfully injected  
[Gemini] thinkingConfig injected for gemini-2.5-flash: {'thinkingBudget': 50, 'includeThoughts': True}
genKeys=['temperature', 'maxOutputTokens', 'topP', 'thinkingConfig']
```

## Benefits
1. **No more API errors** - Prevents 400 errors on unsupported models
2. **User-friendly warnings** - Clear messaging about model capabilities
3. **Graceful degradation** - Chat continues with standard generation
4. **Maintains functionality** - Full reasoning support on compatible models
5. **Future-proof** - Easy to extend for new Gemini models

## Files Changed
- `adapters/gemini_provider.py` - Added model version checking logic

## Commit
- Hash: `88bd747`
- Message: "Fix: Restrict thinking mode to Gemini 2.5+ models only"

**Status: ✅ RESOLVED** - Thinking mode now works correctly across all Gemini models without API errors.
