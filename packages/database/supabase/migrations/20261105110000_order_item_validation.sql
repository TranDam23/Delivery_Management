alter table public.order_items
  add constraint order_items_item_name_length_check
    check (char_length(btrim(item_name)) between 1 and 200) not valid,
  add constraint order_items_item_type_length_check
    check (item_type is null or char_length(item_type) <= 100) not valid,
  add constraint order_items_quantity_range_check
    check (quantity between 1 and 10000) not valid,
  add constraint order_items_weight_range_check
    check (weight is null or (weight > 0 and weight <= 10000)) not valid,
  add constraint order_items_length_range_check
    check (length is null or (length > 0 and length <= 1000)) not valid,
  add constraint order_items_width_range_check
    check (width is null or (width > 0 and width <= 1000)) not valid,
  add constraint order_items_height_range_check
    check (height is null or (height > 0 and height <= 1000)) not valid,
  add constraint order_items_declared_value_range_check
    check (declared_value is null or (declared_value >= 0 and declared_value <= 999999999999.99)) not valid,
  add constraint order_items_note_length_check
    check (note is null or char_length(note) <= 1000) not valid;
