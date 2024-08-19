#include "tree_parse.hpp"

uint64_t calculate_left_sum(TreeNode &node, uint64_t &running_sum) {
  if (node.children.empty()) {
    // left_sum is the starting_time for the current function
    node.left_sum = running_sum;
    // sum of leaf values (walltimes) to the left = start_time current
    running_sum += node.value;
  } else {
    for (auto &child : node.children) {
      calculate_left_sum(child, running_sum);
    }
    if (!node.children.empty()) {
      // parent start_time = left most child start_time
      node.left_sum = node.children.front().left_sum;
    }
  }
  return node.left_sum;
}

TreeNode prune_tree(const TreeNode &node, uint64_t threshold_left,
                    uint64_t threshold_right) {
  TreeNode pruned_node = node;

  pruned_node.children.clear();

  for (const auto &child : node.children) {
    // this includes all the functions that have any overlap
    // with the time between the two thresholds
    if ((child.left_sum + child.value) > threshold_left &&
        child.left_sum < threshold_right) {
      pruned_node.children.push_back(prune_tree(child, threshold_left,
                                                threshold_right));
    }
  }

  uint64_t extra_time_left =
    threshold_left > node.left_sum ? threshold_left - node.left_sum : 0;
  uint64_t extra_time_right =
    (node.left_sum + node.value) > threshold_right ?
    node.left_sum + node.value - threshold_right : 0;
  // substract extra left + right time intervals from walltime if any
  pruned_node.value = node.value - extra_time_left - extra_time_right;

  return pruned_node;
}
