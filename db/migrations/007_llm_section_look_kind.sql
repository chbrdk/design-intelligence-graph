-- Allow section_look LLM items for compositional look & feel descriptions
ALTER TABLE llm_items DROP CONSTRAINT IF EXISTS llm_items_kind_check;
ALTER TABLE llm_items
  ADD CONSTRAINT llm_items_kind_check
  CHECK (kind IN (
    'screen_pattern',
    'ui_element',
    'recipe_insight',
    'page_flow',
    'visual_style',
    'section_look'
  ));
