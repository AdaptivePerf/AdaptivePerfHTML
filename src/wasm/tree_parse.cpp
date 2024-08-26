#include <unordered_map>
#include "tree_parse.hpp"

TreeNode prune_tree(const TreeNode &node, uint64_t threshold_left,
                    uint64_t threshold_right, const std::string counter_name) {
  TreeNode pruned_node = node;

  pruned_node.children.clear();

  // if leaf node remove samples outside time interval and subtract from total value
  if (node.children.empty()) {
    uint64_t extra_value = 0;

    for (auto it = pruned_node.samples.begin(); it != pruned_node.samples.end();) {
      // if walltime, make a more refined guess of the zoomed-in walltime
      // of the current node
      if (counter_name == "walltime") {
        if (it->timestamp - it->value < threshold_left &&
            it->timestamp >= threshold_left) {
          extra_value += threshold_left - (it->timestamp - it->value);
          ++it;
        } else if (it->timestamp - it->value < threshold_right &&
                   it->timestamp >= threshold_right) {
          extra_value += it->timestamp - threshold_right;
          ++it;
        } else if (it->timestamp < threshold_left ||
                   it->timestamp > threshold_right) {
          extra_value += it->value;
          it = pruned_node.samples.erase(it);
        } else {
          ++it;
        }
      } else { // for other types of counters, just substract the period
        if (it->timestamp < threshold_left || it->timestamp > threshold_right) {
          extra_value += it->value;
          it = pruned_node.samples.erase(it);
        } else {
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
      TreeNode pruned_child = prune_tree(child, threshold_left, threshold_right,
                                         counter_name);

      // add the child if after extra counters (outside timeinterval)
      // where substracted, final value > 0
      if (pruned_child.value > 0) {
        pruned_node.children.push_back(pruned_child);
        // new value of parent is sum of children values
        pruned_node.value += pruned_child.value;
      }
    }

    if (pruned_node.value == 0 && pruned_node.children.empty()) {
      return {};
    }
  }

  return pruned_node;
}



TreeNode merge_nodes(TreeNode& node) {
    std::unordered_map<std::string, TreeNode> grouped_children;

    for (auto& child : node.children) {
        TreeNode merged_child = merge_nodes(child);

        if (grouped_children.find(merged_child.name) != grouped_children.end()) {
            grouped_children[merged_child.name].value += merged_child.value;

            grouped_children[merged_child.name].children.insert(
                grouped_children[merged_child.name].children.end(),
                merged_child.children.begin(),
                merged_child.children.end()
            );
        } else {
            grouped_children[merged_child.name] = merged_child;
        }
    }

    node.children.clear();
    for (auto& entry : grouped_children) {
        node.children.push_back(entry.second);
    }

    return node;
}

TreeNode slice_flame_graph(const TreeNode &node, uint64_t threshold_left,
                    uint64_t threshold_right, const std::string counter_name, bool time_ordered){

      if(time_ordered){
         return  prune_tree(node, threshold_left,
                    threshold_right, counter_name);
      }

      TreeNode pruned_tree = prune_tree(node, threshold_left,
                    threshold_right, counter_name);
      return merge_nodes(pruned_tree);
          
}
