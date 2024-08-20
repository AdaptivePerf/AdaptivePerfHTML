#include "tree_parse.hpp"

TreeNode prune_tree(const TreeNode &node, uint64_t threshold_left,
                    uint64_t threshold_right, const std::string counter_name) {
  TreeNode pruned_node = node;

  pruned_node.children.clear();

  if (node.children.empty()) {  // if leaf node remove samples outside time interval and subtract from total value
    uint64_t extra_value = 0;

    for (auto it = pruned_node.samples.begin(); it != pruned_node.samples.end();) {
      if (counter_name == "walltime"){ //if walltime, make a more refined guess of the zoomed-in walltime of the current node
          if (it->timestamp - it->value < threshold_left && it->timestamp >= threshold_left){
            extra_value += threshold_left - (it->timestamp - it->value);
            ++it;
          }
          else if (it->timestamp - it->value < threshold_right && it->timestamp >= threshold_right){
            extra_value += it->timestamp - threshold_right;
            ++it;
          }
          else if (it->timestamp < threshold_left || it->timestamp > threshold_right){
            extra_value += it->value;
            it = pruned_node.samples.erase(it);
          }
          else{
            ++it;
          }
      }
      else //for other types of counters, just substract the period
      {

        if (it->timestamp < threshold_left || it->timestamp > threshold_right)
        {
          extra_value += it->value;
          it = pruned_node.samples.erase(it);
        }
        else
        {
          ++it;
        }
      }
    }
    pruned_node.value -= extra_value;
    if (pruned_node.value == 0) {
        return {}; //no value, means it would not be displayed 
    }

  } else { 
    pruned_node.value = 0;

    for (const auto &child : node.children) {
        TreeNode pruned_child = prune_tree(child, threshold_left, threshold_right, counter_name);

        // add the child if after extra counters (outside timeinterval) where substracted, final value > 0
        if (pruned_child.value > 0) {
          pruned_node.children.push_back(pruned_child);
          pruned_node.value += pruned_child.value; //new value of parent is sum of children values
        }
    }

    if (pruned_node.value == 0 && pruned_node.children.empty()) {
        return {}; 
    }
  }

  return pruned_node;
}
